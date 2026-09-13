import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

let executable;
if (process.platform === 'win32') executable = 'release/win-unpacked/Mardar.exe';
else if (process.platform === 'linux') executable = 'release/linux-unpacked/mardar';
else if (process.platform === 'darwin') {
  executable = readdirSync('release').map(dir => `release/${dir}/Mardar.app/Contents/MacOS/Mardar`).find(existsSync);
}
if (!executable || !existsSync(executable)) throw new Error('请先运行 npm run pack 或 npm run dist 生成当前系统的应用包');
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
  stdio: 'inherit',
  env: { ...process.env, MARDAR_APP_PATH: resolve(executable) },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
