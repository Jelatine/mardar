import './style.css';
import icon from '../build/icon.svg';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import { renderDocument, sourceBlocks } from './render';
import { sample } from './sample';
const api = window.desktop;
const $ = s => document.querySelector(s);
let name = '欢迎使用 Mardar.md', base = '', saved = sample, format = 'markdown', version = 0, rendering = Promise.resolve(), timer;
let draft; try { draft = JSON.parse(localStorage.getItem('mardar-draft')); } catch {}
$('#app').innerHTML = `<aside class="sidebar"><div class="brand"><img class="brand-icon" src="${icon}" alt=""><strong>Mardar</strong></div><div class="workspace-label">个人写作空间</div><button class="new" id="new">＋ 新建文档 <kbd>⌘ N</kbd></button><button class="open" id="open">▱ 打开本地文件</button><details id="recent"><summary>最近打开</summary><div id="recent-list"></div></details><button id="about">关于 Mardar</button><div class="nav-label">当前文档</div><div class="active-doc">▤ <span id="side-name"></span></div><div class="outline-header">文档大纲 <span>≡</span></div><nav id="outline"></nav><div class="sidebar-footer"><span class="online"></span> 本地优先 · 自由创作<small>Markdown 编辑器</small></div></aside><main><header><div class="breadcrumb">写作空间 <span>/</span> <b id="name"></b><i id="dirty"></i></div><div class="actions"><button id="save">保存</button><button id="save-as">另存为</button><button class="primary" id="pdf">↓ 导出 PDF</button></div></header><section class="toolbar"><div class="format-tools"><button data-wrap="**" title="粗体">B</button><button data-wrap="*" title="斜体"><i>I</i></button><button data-prefix="## " title="标题">H₂</button><span class="divider"></span><button data-prefix="> " title="引用">❞</button><button data-prefix="- " title="列表">☷</button><button id="link" title="插入链接">↗</button><button id="image" title="插入图片">▧</button><button id="code" title="代码块">&lt;/&gt;</button><button id="math" title="数学公式">ƒx</button><button id="chart" title="Mermaid 图表">◇</button></div><div class="view-tools"><button data-view="live">即时编辑</button><button data-view="edit">编辑</button><button class="selected" data-view="split">分栏</button><button data-view="read">阅读</button><button id="theme" title="切换深色主题">◐</button></div></section><section class="panes" data-view="split"><div id="live" class="prose"></div><div class="editor-pane"><div class="pane-label">源文档 <span>纯粹书写，自由表达</span></div><textarea id="editor" spellcheck="false" aria-label="文档编辑器"></textarea></div><div class="preview-pane"><div class="pane-label">实时预览 <span>✦ 所见即所得</span></div><div id="preview"></div></div></section><footer><span id="status">准备就绪</span><span><span id="count"></span><span class="footer-divider">|</span>UTF-8<span class="footer-divider">|</span><span id="position">行 1，列 1</span></span></footer></main><input type="file" id="file" accept=".md,.markdown" hidden><input type="file" id="image-file" accept="image/*" hidden><dialog id="confirm"><h2>保存当前更改？</h2><p>离开当前文档前，可以保存你的写作内容。</p><div><button data-choice="cancel">取消</button><button data-choice="discard">不保存</button><button class="primary" data-choice="save">保存</button></div></dialog>`;
if (!/Mac/.test(navigator.platform)) $('.new kbd').textContent = 'Ctrl N';
const editor = $('#editor'); editor.value = draft?.content ?? sample;
if (draft) { name = draft.name; format = 'markdown'; }

function status(text) { $('#status').textContent = text; }
function metadata() { $('#name').textContent = name; $('#side-name').textContent = name; $('#dirty').textContent = editor.value !== saved ? '●' : ''; document.title = `${name} · Mardar`; api?.dirty(editor.value !== saved); $('#count').textContent = `${editor.value.replace(/\s/g, '').length.toLocaleString()} 字符`; }
function persist() { try { localStorage.setItem('mardar-draft', JSON.stringify({ content: editor.value, name, format })); } catch { status('草稿存储已满，请保存到文件'); } }
function render() { const id = ++version; rendering = renderDocument(editor.value, format, base).then(root => { if (id !== version) return; $('#preview').replaceChildren(root); $('#outline').replaceChildren(); root.querySelectorAll('h1,h2,h3').forEach(h => { const b = document.createElement('button'); b.textContent = h.textContent; b.className = h.tagName.toLowerCase(); b.onclick = () => h.scrollIntoView({ behavior: 'smooth' }); $('#outline').append(b); }); }); return rendering; }
function changed() { metadata(); persist(); clearTimeout(timer); timer = setTimeout(() => render().catch(e => status(e.message)), 220); }
editor.addEventListener('input', changed);
editor.addEventListener('keyup', () => { const lines = editor.value.slice(0, editor.selectionStart).split('\n'); $('#position').textContent = `行 ${lines.length}，列 ${lines.at(-1).length + 1}`; });
function insert(text, suffix = '') { if ($('.panes').dataset.view === 'live') document.querySelector('button[data-view=split]').click(); const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd); editor.focus(); document.execCommand('insertText', false, text + selected + suffix); changed(); }
document.querySelectorAll('[data-wrap]').forEach(b => b.onclick = () => insert(b.dataset.wrap, b.dataset.wrap));
document.querySelectorAll('[data-prefix]').forEach(b => b.onclick = () => insert(b.dataset.prefix));
$('#link').onclick = () => insert('[', '](https://example.com)');
$('#code').onclick = () => insert('\n```javascript\n', '\n```\n');
$('#math').onclick = () => insert('\n$$\n', '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n');
$('#chart').onclick = () => insert('\n```mermaid\ngraph LR\n  A[开始] --> B[完成]\n```\n');
document.querySelectorAll('[data-view]').forEach(b => { if (b.tagName !== 'BUTTON') return; b.onclick = () => { $('.panes').dataset.view = b.dataset.view; if (b.dataset.view === 'live') renderLive(); document.querySelectorAll('.view-tools [data-view]').forEach(x => x.classList.toggle('selected', x === b)); }; });
$('#theme').onclick = () => document.body.classList.toggle('dark');

function download(content, filename, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
async function save(saveAs = false) { try { const content = editor.value; const result = api ? await api.save(content, saveAs, format) : { name }; if (!result) return false; if (!api) download(content, name, 'text/plain;charset=utf-8'); name = result.name; base = result.base || ''; saved = content; metadata(); persist(); await render(); await refreshRecent(); status('文档已保存'); return true; } catch (e) { status(`保存失败：${e.message}`); return false; } }
async function mayLeave() { if (editor.value === saved) return true; const choice = await new Promise(resolve => { const d = $('#confirm'); d.showModal(); d.oncancel = e => { e.preventDefault(); d.close(); resolve('cancel'); }; d.querySelectorAll('button').forEach(b => b.onclick = () => { d.close(); resolve(b.dataset.choice); }); }); return choice === 'discard' || (choice === 'save' && await save()); }
async function load(doc) { editor.value = doc.content; saved = doc.content; name = doc.name; base = doc.base || ''; format = 'markdown';  changed(); await render(); if ($('.panes').dataset.view === 'live') await renderLive(); await refreshRecent(); }
$('#save').onclick = () => save(); $('#save-as').onclick = () => save(true);
$('#new').onclick = async () => { if (!await mayLeave()) return; await api?.newDocument(); await load({ content: '', name: '未命名.md', format: 'markdown' }); editor.focus(); };
$('#open').onclick = async () => { if (!await mayLeave()) return; try { if (api) { const doc = await api.open(); if (doc) await load(doc); } else $('#file').click(); } catch (e) { status(`打开失败：${e.message}`); } };
$('#file').onchange = async e => { const f = e.target.files[0]; if (f) await load({ content: await f.text(), name: f.name, format: 'markdown' }); e.target.value = ''; };
function addImage(item) { insert(`![图片](${item.url})`); }
function readImage(file) { const reader = new FileReader(); reader.onload = () => addImage({ url: reader.result }); reader.readAsDataURL(file); }
$('#image').onclick = async () => { try { if (api) { const item = await api.image(); if (item) addImage(item); } else $('#image-file').click(); } catch (e) { status(e.message); } };
$('#image-file').onchange = e => { if (e.target.files[0]) readImage(e.target.files[0]); e.target.value = ''; };
editor.addEventListener('dragover', e => e.preventDefault()); editor.addEventListener('drop', e => { e.preventDefault(); for (const f of e.dataTransfer.files) if (f.type.startsWith('image/')) readImage(f); });
editor.addEventListener('paste', e => { const images = [...e.clipboardData.files].filter(f => f.type.startsWith('image/')); if (images.length) { e.preventDefault(); images.forEach(readImage); } });
$('#pdf').onclick = async () => { const button = $('#pdf'); button.disabled = true; status('正在排版 PDF…'); try { clearTimeout(timer); await render(); await document.fonts.ready; await Promise.all([...$('#preview').querySelectorAll('img')].map(img => img.decode().catch(() => {}))); if (api) { const path = await api.pdf(); status(path ? `PDF 已导出：${path}` : '已取消导出'); } else { window.print(); status('已打开打印对话框，请选择保存为 PDF'); } } catch (e) { status(`导出失败：${e.message}`); } finally { button.disabled = false; } };
document.addEventListener('keydown', e => { if (!(e.metaKey || e.ctrlKey)) return; const key = e.key.toLowerCase(); if (['s', 'o', 'n', 'b', 'i'].includes(key)) { e.preventDefault(); if (key === 's') save(e.shiftKey); if (key === 'o') $('#open').click(); if (key === 'n') $('#new').click(); if (key === 'b') document.querySelectorAll('[data-wrap]')[0].click(); if (key === 'i') document.querySelectorAll('[data-wrap]')[1].click(); } });
window.addEventListener('beforeunload', e => { if (!api && editor.value !== saved) { e.preventDefault(); e.returnValue = ''; } });
metadata(); render().catch(e => status(e.message));

async function refreshRecent() {
  if (!api) return;
  const list = $('#recent-list'); list.replaceChildren();
  for (const file of await api.recent()) { const b = document.createElement('button'); b.textContent = file.split(/[\\/]/).pop(); b.title = file; b.onclick = async () => { if (!await mayLeave()) return; try { await load(await api.openRecent(file)); } catch (e) { status(`打开失败：${e.message}`); } }; list.append(b); }
}
$('#about').onclick = async () => { const info = api ? await api.about() : { tag: '开发预览', builtAt: '—', commit: '—' }; const d = document.createElement('dialog'); const text = document.createElement('p'); text.style.whiteSpace = 'pre-line'; text.textContent = `Mardar · Markdown 编辑器\n版本：${info.tag}\n编译日期：${info.builtAt}\n提交哈希：${info.commit}`; const close = document.createElement('button'); close.textContent = '关闭'; close.onclick = () => { d.close(); d.remove(); }; d.append(text, close); document.body.append(d); d.showModal(); };
let liveGeneration = 0;
async function renderLive() {
  const generation = ++liveGeneration, host = $('#live'); host.replaceChildren();
  const blocks = sourceBlocks(editor.value);
  for (const block of blocks) {
    const item = document.createElement('div'); item.className = 'live-block'; item.tabIndex = 0;
    item.append(await renderDocument(block.text, 'markdown', base));
    if (generation !== liveGeneration) return;
    const activate = () => {
      if (item.querySelector('textarea')) return;
      const input = document.createElement('textarea'); input.value = block.text; input.setAttribute('aria-label', '当前段落 Markdown');
      item.replaceChildren(input); input.style.height = `${Math.max(100, input.scrollHeight)}px`; input.focus();
      input.oninput = () => { editor.value = editor.value.slice(0, block.start) + input.value + editor.value.slice(block.start + block.text.length); block.text = input.value; changed(); input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`; };
      input.onblur = () => renderLive();
      input.onkeydown = e => { if (e.key === 'Escape') input.blur(); };
    };
    item.onclick = activate; item.onkeydown = e => { if (e.target === item && e.key === 'Enter') activate(); }; host.append(item);
  }
}
let processingOpen = false;
async function openRequested() { if (processingOpen) return; processingOpen = true; try { let file; while ((file = await api.pending())) { if (!await mayLeave()) { await api.dismissPending(file); continue; } await load(await api.openPending(file)); } } catch (e) { status(`打开失败：${e.message}`); } finally { processingOpen = false; } }
api?.onOpenRequest(openRequested); refreshRecent(); if (api) openRequested();
