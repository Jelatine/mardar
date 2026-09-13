import './style.css';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import './print.css';
import { renderDocument, sourceBlocks } from './render';
import { formulaTemplates, chartTemplates } from './templates';
const api = window.desktop;
if (api) document.body.classList.add(/Mac/.test(navigator.platform) ? 'desktop-mac' : 'desktop-overlay');
const $ = s => document.querySelector(s);
let name = '未命名.md', base = '', saved = '', format = 'markdown', version = 0, rendering = Promise.resolve(), timer;
// Older versions persisted drafts; every launch now starts with a clean document.
try { localStorage.removeItem('mardar-draft'); } catch {}
$('#app').innerHTML = `<aside class="sidebar"><button class="new" id="new">＋ 新建文档 <kbd>⌘ N</kbd></button><button class="open" id="open">▱ 打开本地文件</button><details id="recent"><summary>最近打开</summary><div id="recent-list"></div></details><div class="actions"><button id="save">保存</button><button id="save-as">另存为</button><button class="primary" id="pdf">↓ 导出 PDF</button></div><div class="outline-header">文档大纲 <span>≡</span></div><nav id="outline"></nav><div class="sidebar-footer"><span class="online"></span> 本地优先 · 自由创作<button id="about">关于 Mardar</button></div></aside><main><header class="titlebar"><button id="toggle-sidebar" title="隐藏左侧工具栏" aria-label="隐藏左侧工具栏" aria-expanded="true">☰</button><div class="breadcrumb"><b id="name"></b><i id="dirty" aria-label="未保存"></i></div></header><section class="toolbar"><div class="format-tools"><button id="undo" title="撤销">↶</button><button id="redo" title="重做">↷</button><span class="divider"></span><button data-wrap="**" title="粗体">B</button><button data-wrap="*" title="斜体"><i>I</i></button><button id="heading" title="标题">H ▾</button><span class="divider"></span><button data-prefix="> " title="引用">❞</button><button data-prefix="- " title="列表">☷</button><button id="link" title="插入链接">↗</button><button id="image" title="插入图片">▧ ▾</button><button id="code" title="代码块">&lt;/&gt; ▾</button><button id="math" title="数学公式">ƒx ▾</button><button id="chart" title="Mermaid 图表">◇ ▾</button></div><div class="view-tools"><button class="selected" data-view="live">即时编辑</button><button data-view="edit">编辑</button><button data-view="split">分栏</button><button data-view="read">阅读</button><button id="theme" title="切换深色主题">◐</button></div></section><section class="panes" data-view="live"><div id="live" class="prose"></div><div class="editor-pane"><div class="pane-label">源文档 <span>纯粹书写，自由表达</span></div><textarea id="editor" spellcheck="false" aria-label="文档编辑器"></textarea></div><div class="preview-pane"><div class="pane-label">实时预览 <span>✦ 所见即所得</span></div><div id="preview"></div></div></section><footer><span id="status">准备就绪</span><span><span id="count"></span><span class="footer-divider">|</span>UTF-8<span class="footer-divider">|</span><span id="position">行 1，列 1</span></span></footer></main><input type="file" id="file" accept=".md,.markdown" hidden><input type="file" id="image-file" accept="image/*" hidden><dialog id="confirm"><h2>保存当前更改？</h2><p>离开当前文档前，可以保存你的写作内容。</p><div><button data-choice="cancel">取消</button><button data-choice="discard">不保存</button><button class="primary" data-choice="save">保存</button></div></dialog>`;
if (!/Mac/.test(navigator.platform)) $('.new kbd').textContent = 'Ctrl N';
const editor = $('#editor'); editor.value = '';

function status(text) { $('#status').textContent = text; }
function metadata() { $('#name').textContent = name; $('#dirty').textContent = editor.value !== saved ? '●' : ''; document.title = `${editor.value !== saved ? '● ' : ''}${name} · Mardar`; api?.dirty(editor.value !== saved); $('#count').textContent = `${editor.value.replace(/\s/g, '').length.toLocaleString()} 字符`; }
function render() { const id = ++version; rendering = renderDocument(editor.value, format, base).then(root => { if (id !== version) return; $('#preview').replaceChildren(root); $('#outline').replaceChildren(); root.querySelectorAll('h1,h2,h3').forEach(h => { const b = document.createElement('button'); b.textContent = h.textContent; b.className = h.tagName.toLowerCase(); b.onclick = () => { if ($('.panes').dataset.view === 'live') { const headings = [...$('#live').querySelectorAll('h1,h2,h3')]; headings[[...root.querySelectorAll('h1,h2,h3')].indexOf(h)]?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } else h.scrollIntoView({ block: 'start', behavior: 'smooth' }); }; $('#outline').append(b); }); }); return rendering; }
let history = [''], historyIndex = 0, editGroup = null;
function breakHistoryGroup() { editGroup = null; }
function changed(event) {
  if (history[historyIndex] !== editor.value) {
    const now = performance.now(), target = event?.target;
    const type = event?.isComposing ? 'composition' : event?.inputType;
    const continuous = ['insertText', 'insertCompositionText', 'composition', 'deleteContentBackward', 'deleteContentForward'].includes(type);
    const caret = target?.selectionStart;
    const adjacent = editGroup && Math.abs(caret - editGroup.caret) <= Math.max(1, event?.data?.length || 0);
    const merge = continuous && editGroup?.target === target && editGroup.type === type && adjacent && now - editGroup.time < 900 && historyIndex === history.length - 1;
    if (merge) history[historyIndex] = editor.value;
    else { history.splice(++historyIndex); history.push(editor.value); }
    editGroup = continuous ? { target, type, caret, time: now } : null;
  }
  $('#undo').disabled = historyIndex === 0; $('#redo').disabled = historyIndex === history.length - 1; metadata(); clearTimeout(timer); timer = setTimeout(() => render().catch(e => status(e.message)), 220); }
editor.addEventListener('input', changed);
editor.addEventListener('keyup', () => { const lines = editor.value.slice(0, editor.selectionStart).split('\n'); $('#position').textContent = `行 ${lines.length}，列 ${lines.at(-1).length + 1}`; });
function insert(text, suffix = '', replaceSelection = false) {
  breakHistoryGroup();
  const start = editor.selectionStart, end = editor.selectionEnd;
  editor.setRangeText(text + (replaceSelection ? '' : editor.value.slice(start, end)) + suffix, start, end, 'end');
  changed();
  if ($('.panes').dataset.view === 'live') renderLive(); else editor.focus();
}
function insertHeading(level) {
  const start = editor.value.lastIndexOf('\n', editor.selectionStart - 1) + 1;
  const end = editor.value.indexOf('\n', start);
  const line = editor.value.slice(start, end < 0 ? editor.value.length : end);
  editor.setSelectionRange(start, start + (line.match(/^#{1,6}\s+/)?.[0].length || 0));
  insert('#'.repeat(level) + ' ', '', true);
}
document.querySelectorAll('[data-wrap]').forEach(b => b.onclick = () => insert(b.dataset.wrap, b.dataset.wrap));
document.querySelectorAll('[data-prefix]').forEach(b => b.onclick = () => insert(b.dataset.prefix));
$('#link').onclick = () => insert('[', '](https://example.com)');
document.querySelectorAll('[data-view]').forEach(b => { if (b.tagName !== 'BUTTON') return; b.onclick = () => { breakHistoryGroup(); $('.panes').dataset.view = b.dataset.view; if (b.dataset.view === 'live') renderLive(); document.querySelectorAll('.view-tools [data-view]').forEach(x => x.classList.toggle('selected', x === b)); }; });
$('#toggle-sidebar').onclick = () => { const hidden = $('#app').classList.toggle('sidebar-hidden'); $('#toggle-sidebar').setAttribute('aria-expanded', String(!hidden)); $('#toggle-sidebar').title = $('#toggle-sidebar').ariaLabel = hidden ? '展开左侧工具栏' : '隐藏左侧工具栏'; };
$('#theme').onclick = async () => { const dark = document.body.classList.toggle('dark'); await api?.theme(dark); };
$('#undo').onclick = () => undoRedo(); $('#redo').onclick = () => undoRedo(true);
$('#undo').disabled = $('#redo').disabled = true;
editor.addEventListener('blur', breakHistoryGroup);
document.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) breakHistoryGroup(); });
document.addEventListener('pointerdown', breakHistoryGroup);

function download(content, filename, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
async function save(saveAs = false) { breakHistoryGroup(); try { const content = editor.value; const result = api ? await api.save(content, saveAs, format) : { name }; if (!result) return false; if (!api) download(content, name, 'text/plain;charset=utf-8'); name = result.name; base = result.base || ''; saved = content; metadata(); await render(); await refreshRecent(); status('文档已保存'); return true; } catch (e) { status(`保存失败：${e.message}`); return false; } }
async function mayLeave() { if (editor.value === saved) return true; const choice = await new Promise(resolve => { const d = $('#confirm'); d.showModal(); d.oncancel = e => { e.preventDefault(); d.close(); resolve('cancel'); }; d.querySelectorAll('button').forEach(b => b.onclick = () => { d.close(); resolve(b.dataset.choice); }); }); return choice === 'discard' || (choice === 'save' && await save()); }
async function load(doc) { breakHistoryGroup(); editor.value = doc.content; history = [editor.value]; historyIndex = 0; saved = editor.value; name = doc.name; base = doc.base || ''; format = 'markdown';  changed(); await render(); if ($('.panes').dataset.view === 'live') await renderLive(); await refreshRecent(); }
$('#save').onclick = () => save(); $('#save-as').onclick = () => save(true);
$('#new').onclick = async () => { if (!await mayLeave()) return; await api?.newDocument(); await load({ content: '', name: '未命名.md', format: 'markdown' }); editor.focus(); };
$('#open').onclick = async () => { if (!await mayLeave()) return; try { if (api) { const doc = await api.open(); if (doc) await load(doc); } else $('#file').click(); } catch (e) { status(`打开失败：${e.message}`); } };
$('#file').onchange = async e => { const f = e.target.files[0]; if (f) await load({ content: await f.text(), name: f.name, format: 'markdown' }); e.target.value = ''; };
let imageFormat = 'markdown';
function addImage(item) { insert(imageFormat === 'html' ? `<img src="${item.url.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" alt="图片" width="600" />` : `![图片](${item.url})`); }
function readImage(file) { const reader = new FileReader(); reader.onload = () => addImage({ url: reader.result }); reader.readAsDataURL(file); }
async function chooseImage(kind) { imageFormat = kind; try { if (api) { const item = await api.image(); if (item) addImage(item); } else $('#image-file').click(); } catch (e) { status(e.message); } };
$('#image-file').onchange = e => { if (e.target.files[0]) readImage(e.target.files[0]); e.target.value = ''; };
editor.addEventListener('dragover', e => e.preventDefault()); editor.addEventListener('drop', e => { e.preventDefault(); for (const f of e.dataTransfer.files) if (f.type.startsWith('image/')) readImage(f); });
editor.addEventListener('paste', e => { const images = [...e.clipboardData.files].filter(f => f.type.startsWith('image/')); if (images.length) { e.preventDefault(); images.forEach(readImage); } });
$('#pdf').onclick = async () => { const button = $('#pdf'); button.disabled = true; status('正在排版 PDF…'); try { clearTimeout(timer); await render(); await document.fonts.ready; await Promise.all([...$('#preview').querySelectorAll('img')].map(img => img.decode().catch(() => {}))); if (api) { const path = await api.pdf(); status(path ? `PDF 已导出：${path}` : '已取消导出'); } else { window.print(); status('已打开打印对话框，请选择保存为 PDF'); } } catch (e) { status(`导出失败：${e.message}`); } finally { button.disabled = false; } };
document.addEventListener('keydown', e => { if (!(e.metaKey || e.ctrlKey)) return; const key = e.key.toLowerCase(); if (key === 'z' || key === 'y') { e.preventDefault(); undoRedo(key === 'y' || e.shiftKey); return; } if (['s', 'o', 'n', 'b', 'i'].includes(key)) { e.preventDefault(); if (key === 's') save(e.shiftKey); if (key === 'o') $('#open').click(); if (key === 'n') $('#new').click(); if (key === 'b') document.querySelectorAll('[data-wrap]')[0].click(); if (key === 'i') document.querySelectorAll('[data-wrap]')[1].click(); } });
window.addEventListener('beforeunload', e => { if (!api && editor.value !== saved) { e.preventDefault(); e.returnValue = ''; } });
metadata(); render().catch(e => status(e.message));

async function refreshRecent() {
  if (!api) return;
  const list = $('#recent-list'); list.replaceChildren();
  for (const file of await api.recent()) { const b = document.createElement('button'); b.textContent = file.split(/[\\/]/).pop(); b.title = file; b.onclick = async () => { if (!await mayLeave()) return; try { await load(await api.openRecent(file)); } catch (e) { status(`打开失败：${e.message}`); } }; list.append(b); }
}
$('#about').onclick = async () => { const info = api ? await api.about() : { tag: '开发预览', builtAt: '—', commit: '—' }; const d = document.createElement('dialog'); const text = document.createElement('p'); text.style.whiteSpace = 'pre-line'; text.textContent = `Mardar · Markdown 编辑器\n版本：${info.tag}\n编译日期：${info.builtAt}\n提交哈希：${info.commit}`; const close = document.createElement('button'); close.textContent = '关闭'; close.onclick = () => { d.close(); d.remove(); }; d.append(text, close); document.body.append(d); d.showModal(); };
function undoRedo(redo = false) {
  breakHistoryGroup();
  const next = historyIndex + (redo ? 1 : -1);
  if (next < 0 || next >= history.length) return;
  const active = $('#live textarea'); if (active) active.onblur = null;
  historyIndex = next; editor.value = history[next]; metadata(); render(); $('#undo').disabled = historyIndex === 0; $('#redo').disabled = historyIndex === history.length - 1;
  if ($('.panes').dataset.view === 'live') renderLive();
}
editor.addEventListener('beforeinput', e => { if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') { e.preventDefault(); undoRedo(e.inputType === 'historyRedo'); } });
api?.onHistory?.(undoRedo);
let liveGeneration = 0;
async function renderLive() {
  const generation = ++liveGeneration, host = $('#live'), scroll = host.scrollTop; host.replaceChildren();
  const blocks = sourceBlocks(editor.value);
  for (const block of blocks) {
    const item = document.createElement('div'); item.className = 'live-block'; item.tabIndex = 0;
    item.append(await renderDocument(block.text, 'markdown', base));
    if (generation !== liveGeneration) return;
    const activate = () => {
      if (item.querySelector('textarea')) return;
      const input = document.createElement('textarea'); input.value = block.text; input.setAttribute('aria-label', '当前段落 Markdown');
      item.replaceChildren(input); input.style.height = `${Math.max(100, input.scrollHeight)}px`; input.focus(); editor.setSelectionRange(block.start, block.start);
      input.onbeforeinput = e => { if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') { e.preventDefault(); undoRedo(e.inputType === 'historyRedo'); } };
      input.onselect = input.onkeyup = input.onclick = () => { editor.setSelectionRange(block.start + input.selectionStart, block.start + input.selectionEnd); };
      input.oninput = event => { editor.value = editor.value.slice(0, block.start) + input.value + editor.value.slice(block.start + block.text.length); block.text = input.value; editor.setSelectionRange(block.start + input.selectionStart, block.start + input.selectionEnd); changed(event); input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`; };
      input.onblur = () => { breakHistoryGroup(); renderLive(); };
      input.onkeydown = e => { if (e.key === 'Escape') input.blur(); };
    };
    item.onclick = activate; item.onkeydown = e => { if (e.target === item && e.key === 'Enter') activate(); }; host.append(item); host.scrollTop = scroll;
  }
}
let processingOpen = false;
async function openRequested() { if (processingOpen) return; processingOpen = true; try { let file; while ((file = await api.pending())) { if (!await mayLeave()) { await api.dismissPending(file); continue; } await load(await api.openPending(file)); } } catch (e) { status(`打开失败：${e.message}`); } finally { processingOpen = false; } }
api?.onOpenRequest(openRequested); refreshRecent(); if (api) openRequested();

renderLive().catch(e => status(e.message));

let sourceMeasurements = new Map(), measurementKey = '';
// Measure wrapped source lines using the same typography and width as the textarea.
function sourceY(line) {
  const key = `${version}:${editor.clientWidth}`; if (key !== measurementKey) { sourceMeasurements.clear(); measurementKey = key; }
  if (sourceMeasurements.has(line)) return sourceMeasurements.get(line);
  const mirror = document.createElement('div'), css = getComputedStyle(editor);
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: `${editor.clientWidth}px`, font: css.font, padding: css.padding, boxSizing: 'border-box', tabSize: css.tabSize });
  mirror.textContent = editor.value.split('\n').slice(0, line).join('\n') + (line ? '\n' : '');
  const marker = document.createElement('span'); marker.textContent = '\u200b'; mirror.append(marker); document.body.append(mirror);
  const y = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top; mirror.remove(); sourceMeasurements.set(line, y); return y;
}
function mappedNodes() { return [...$('#preview').querySelectorAll('[data-source-line]')]; }
function markSource(node) { $('#preview .source-active')?.classList.remove('source-active'); node?.classList.add('source-active'); }
function syncCaret() {
  if ($('.panes').dataset.view !== 'split') return;
  const line = editor.value.slice(0, editor.selectionStart).split('\n').length - 1;
  const node = mappedNodes().filter(n => +n.dataset.sourceLine <= line && +n.dataset.sourceEnd > line).at(-1);
  markSource(node); node?.scrollIntoView({ block: 'nearest' });
}
editor.addEventListener('click', syncCaret); editor.addEventListener('keyup', syncCaret);
$('#preview').addEventListener('click', e => {
  if ($('.panes').dataset.view !== 'split' || e.target.closest('a')) return;
  const node = e.target.closest('[data-source-line]'); if (!node) return;
  const line = +node.dataset.sourceLine;
  const offset = editor.value.split('\n').slice(0, line).reduce((n, s) => n + s.length + 1, 0);
  editor.focus(); editor.setSelectionRange(offset, offset); editor.scrollTop = Math.max(0, sourceY(line) - editor.clientHeight / 3); markSource(node);
  $('#position').textContent = `行 ${line + 1}，列 1`;
});
let scrollOwner = null, scrollRelease;
function syncScroll(from, to, reverse) {
  if ($('.panes').dataset.view !== 'split' || (scrollOwner && scrollOwner !== from)) return;
  scrollOwner = from; clearTimeout(scrollRelease);
  const preview = $('#preview'), rect = preview.getBoundingClientRect();
  const points = [{ source: 0, preview: 0 }];
  for (const node of mappedNodes()) {
    const point = { source: sourceY(+node.dataset.sourceLine), preview: node.getBoundingClientRect().top - rect.top + preview.scrollTop };
    if (point.source > points.at(-1).source && point.preview > points.at(-1).preview) points.push(point);
  }
  const key = reverse ? 'preview' : 'source', target = reverse ? 'source' : 'preview';
  points.push({ source: editor.scrollHeight, preview: preview.scrollHeight });
  let i = points.findIndex(p => p[key] > from.scrollTop); if (i < 1) i = points.length - 1;
  const a = points[i - 1], b = points[i];
  to.scrollTop = from.scrollTop >= from.scrollHeight - from.clientHeight - 1 ? to.scrollHeight - to.clientHeight : a[target] + (b[target] - a[target]) * (from.scrollTop - a[key]) / Math.max(1, b[key] - a[key]);
  scrollRelease = setTimeout(() => { scrollOwner = null; }, 100);
}
editor.addEventListener('scroll', () => syncScroll(editor, $('#preview'), false));
$('#preview').addEventListener('scroll', () => syncScroll($('#preview'), editor, true));

// A shared, keyboard-accessible chooser for insertion templates.
function attachMenu(id, options) {
  const trigger = $('#' + id), menu = document.createElement('div');
  menu.className = 'insert-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
  trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
  document.body.append(menu);
  const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
  options.forEach(([label, action]) => {
    const button = document.createElement('button'); button.textContent = label; button.setAttribute('role', 'menuitem');
    button.onclick = () => { close(); action(); }; menu.append(button);
  });
  trigger.onclick = () => {
    const opening = menu.hidden; document.querySelectorAll('.insert-menu').forEach(el => { el.hidden = true; });
    document.querySelectorAll('[aria-haspopup=menu]').forEach(el => el.setAttribute('aria-expanded', 'false'));
    if (!opening) return;
    menu.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    const rect = trigger.getBoundingClientRect(); menu.style.left = `${Math.min(rect.left, innerWidth - menu.offsetWidth - 12)}px`; menu.style.top = `${rect.bottom + 6}px`; menu.firstElementChild.focus();
  };
  menu.onkeydown = e => {
    const items = [...menu.children], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { close(); trigger.focus(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    if (e.key === 'Tab') close();
  };
  document.addEventListener('pointerdown', e => { if (!menu.contains(e.target) && !trigger.contains(e.target)) close(); });
}
attachMenu('heading', Array.from({ length: 6 }, (_, i) => [`H${i + 1} · ${i + 1} 级标题`, () => insertHeading(i + 1)]));
attachMenu('code', ['plaintext', 'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'bash', 'sql', 'json', 'yaml', 'html', 'css'].map(language => [language === 'plaintext' ? '纯文本' : language, () => insert('\n```' + language + '\n', '\n```\n')]));
attachMenu('math', formulaTemplates.map(([label, value]) => [label, () => insert('\n$$\n' + value + '\n$$\n')]));
attachMenu('chart', chartTemplates.map(([label, value]) => [label, () => insert('\n```mermaid\n' + value + '\n```\n')]));
attachMenu('image', [['Markdown 图片', () => chooseImage('markdown')], ['HTML 图片（可调整宽度）', () => chooseImage('html')]]);
