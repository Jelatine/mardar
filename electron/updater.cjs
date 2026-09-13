const { app, net } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

// MARDAR_UPDATE_FEED lets tests serve release metadata locally.
const feed = process.env.MARDAR_UPDATE_FEED || 'https://api.github.com/repos/Jelatine/mardar/releases/latest';
let latest = null, downloaded = null;

const parts = version => String(version).replace(/^v/, '').split(/[-+]/)[0].split('.').map(n => Number.parseInt(n, 10) || 0);
function isNewer(candidate, current) {
  const a = parts(candidate), b = parts(current);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}
// Matches the release artifact names produced by electron-builder's artifactName.
function assetSuffix() {
  const arch = process.platform === 'linux' && process.arch === 'x64' ? 'x86_64' : process.arch;
  return { darwin: `-mac-${arch}.zip`, win32: `-win-${arch}.exe`, linux: `-linux-${arch}.AppImage` }[process.platform];
}
// The installed copy that can be replaced in place, or null when the user must install manually.
function installTarget() {
  if (!app.isPackaged) return null;
  try {
    if (process.platform === 'darwin') {
      const bundle = path.resolve(process.execPath, '../../..');
      if (!bundle.endsWith('.app') || bundle.startsWith('/Volumes/') || bundle.includes('/AppTranslocation/')) return null;
      fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
      return bundle;
    }
    if (process.platform === 'linux') {
      if (!process.env.APPIMAGE) return null;
      fs.accessSync(path.dirname(process.env.APPIMAGE), fs.constants.W_OK);
      return process.env.APPIMAGE;
    }
    if (process.platform === 'win32' && fs.existsSync(path.join(path.dirname(process.execPath), 'Uninstall Mardar.exe'))) return process.execPath;
  } catch {}
  return null;
}
async function request(url, accept = 'application/octet-stream') {
  const response = await net.fetch(url, { headers: { Accept: accept, 'User-Agent': 'Mardar-Updater' } });
  if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
  return response;
}

async function check(current) {
  const release = await (await request(feed, 'application/vnd.github+json')).json();
  if (typeof release.tag_name !== 'string') throw new Error('发布信息无效');
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const suffix = assetSuffix(), asset = suffix && assets.find(a => a.name.endsWith(suffix)), sums = assets.find(a => a.name === 'SHA256SUMS.txt');
  const available = isNewer(release.tag_name, current);
  latest = available && asset && sums ? { tag: release.tag_name, asset, sums } : null;
  if (downloaded && downloaded.tag !== latest?.tag) downloaded = null;
  return { available, tag: release.tag_name, current, url: release.html_url, publishedAt: release.published_at, installable: !!latest && !!installTarget() };
}

async function download(progress) {
  if (!latest) throw new Error('没有可下载的更新，请先检查更新');
  if (downloaded?.tag === latest.tag) return;
  const { tag, asset, sums } = latest, name = path.basename(asset.name);
  const expected = (await (await request(sums.browser_download_url)).text()).split(/\r?\n/)
    .map(line => line.trim().split(/\s+/)).find(([, file]) => file?.replace(/^\*/, '') === asset.name)?.[0]?.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected || '')) throw new Error('SHA256SUMS.txt 中缺少安装包校验值');
  const dir = await fsp.mkdtemp(path.join(app.getPath('temp'), 'mardar-update-')), file = path.join(dir, name);
  try {
    const response = await request(asset.browser_download_url), hash = crypto.createHash('sha256');
    const total = Number(response.headers.get('content-length')) || asset.size || 0;
    let received = 0, reported = 0;
    const meter = new Transform({ transform(chunk, _encoding, done) {
      hash.update(chunk); received += chunk.length;
      if (total && (received >= total || received - reported > total / 100)) { reported = received; progress(Math.min(1, received / total)); }
      done(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(file));
    if (hash.digest('hex') !== expected) throw new Error('安装包 SHA-256 校验失败');
  } catch (error) {
    await fsp.rm(dir, { recursive: true, force: true });
    throw error;
  }
  downloaded = { tag, file, dir };
}

const run = (command, args) => new Promise((resolve, reject) => execFile(command, args, error => (error ? reject(error) : resolve())));
// Stage the downloaded release; the caller quits the app so it can take over.
async function install() {
  if (!downloaded) throw new Error('请先下载更新');
  const target = installTarget();
  if (!target) throw new Error('当前安装方式不支持自动更新，请前往发布页下载');
  const { file, dir } = downloaded;
  if (process.platform === 'darwin') {
    const extracted = path.join(dir, 'extracted');
    await run('/usr/bin/ditto', ['-x', '-k', file, extracted]);
    const bundle = (await fsp.readdir(extracted)).find(name => name.endsWith('.app'));
    if (!bundle) throw new Error('更新包中没有找到应用');
    // Swap bundles once this process exits, restoring the old copy if the move fails.
    const script = 'while kill -0 "$MARDAR_PID" 2>/dev/null; do sleep 0.2; done; rm -rf "$MARDAR_TARGET.previous"; mv "$MARDAR_TARGET" "$MARDAR_TARGET.previous" || exit 1; if mv "$MARDAR_SOURCE" "$MARDAR_TARGET"; then rm -rf "$MARDAR_TARGET.previous" "$MARDAR_DIR"; xattr -dr com.apple.quarantine "$MARDAR_TARGET" 2>/dev/null; else mv "$MARDAR_TARGET.previous" "$MARDAR_TARGET"; fi; open "$MARDAR_TARGET"';
    spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore', env: { ...process.env, MARDAR_PID: String(process.pid), MARDAR_TARGET: target, MARDAR_SOURCE: path.join(extracted, bundle), MARDAR_DIR: dir } }).unref();
  } else if (process.platform === 'linux') {
    const staged = `${target}.update`;
    await fsp.copyFile(file, staged); await fsp.chmod(staged, 0o755); await fsp.rename(staged, target);
    const env = { ...process.env };
    for (const key of ['APPIMAGE', 'APPDIR', 'ARGV0', 'OWD']) delete env[key];
    app.once('will-quit', () => spawn(target, [], { detached: true, stdio: 'ignore', env }).unref());
  } else {
    app.once('will-quit', () => spawn(file, ['--updated'], { detached: true, stdio: 'ignore' }).unref());
  }
  downloaded = null;
}

module.exports = { check, download, install, isNewer };
