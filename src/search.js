export function setupSearch(editor) {
  const bar = document.createElement('section');
  bar.className = 'search-bar'; bar.hidden = true; bar.setAttribute('aria-label', '文本搜索');
  bar.innerHTML = `<div class="search-field"><input id="search-query" type="text" aria-label="搜索文本" placeholder="查找" autocomplete="off" spellcheck="false"><div class="search-options"><label title="区分大小写" aria-label="区分大小写"><input type="checkbox" id="search-case" aria-label="大小写匹配"><span aria-hidden="true">Aa</span></label><label title="全词匹配" aria-label="全词匹配"><input type="checkbox" id="search-word" aria-label="全词匹配"><span class="search-word-icon" aria-hidden="true">ab</span></label><label title="使用正则表达式" aria-label="使用正则表达式"><input type="checkbox" id="search-regex" aria-label="正则表达式"><span aria-hidden="true">.*</span></label></div></div><span id="search-count" role="status" aria-live="polite"></span><div class="search-navigation"><button id="search-prev" aria-label="上一个匹配" title="上一个（Shift+Enter）"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg></button><button id="search-next" aria-label="下一个匹配" title="下一个（Enter）"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3.5 8.5 8 13l4.5-4.5"/></svg></button><button id="search-close" aria-label="关闭搜索" title="关闭（Esc）"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg></button></div>`;
  document.querySelector('.panes').prepend(bar);
  const button = document.createElement('button'); button.id = 'search-toggle'; button.title = '搜索（Ctrl+F / ⌘F）';
  button.setAttribute('aria-label', '搜索'); button.setAttribute('aria-expanded', 'false');
  bar.id = 'search-bar'; button.setAttribute('aria-controls', bar.id);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
  document.querySelector('.toolbar-actions').prepend(button);
  const query = bar.querySelector('#search-query'), count = bar.querySelector('#search-count');
  const prev = bar.querySelector('#search-prev'), next = bar.querySelector('#search-next');
  let worker, timeout, matches = [], index = -1, nodes = [], source = false, previousFocus;
  // Native textarea selections disappear when the find field owns focus.
  // Paint match backgrounds behind the transparent textarea instead.
  const sourceHost = document.createElement('div'); sourceHost.className = 'source-search-host';
  editor.before(sourceHost);
  const overlay = document.createElement('div'); overlay.className = 'source-search-overlay';
  overlay.setAttribute('aria-hidden', 'true'); overlay.hidden = true;
  sourceHost.append(overlay, editor);
  function syncOverlay() {
    const css = getComputedStyle(editor);
    Object.assign(overlay.style, { width: `${editor.clientWidth}px`, height: `${editor.clientHeight}px`, font: css.font, padding: css.padding, tabSize: css.tabSize, letterSpacing: css.letterSpacing });
    overlay.scrollTop = editor.scrollTop; overlay.scrollLeft = editor.scrollLeft;
  }
  editor.addEventListener('scroll', syncOverlay);
  new ResizeObserver(syncOverlay).observe(editor);
  function clear() {
    CSS.highlights?.delete('search-results'); CSS.highlights?.delete('search-current');
    overlay.hidden = true; overlay.replaceChildren();
  }
  function highlightSource() {
    const fragments = document.createDocumentFragment(); let offset = 0;
    matches.forEach(([start, end], i) => {
      fragments.append(document.createTextNode(editor.value.slice(offset, start)));
      const mark = document.createElement('mark'); mark.textContent = editor.value.slice(start, end);
      if (i === index) mark.className = 'search-current';
      fragments.append(mark); offset = end;
    });
    fragments.append(document.createTextNode(editor.value.slice(offset) + '\n'));
    overlay.replaceChildren(fragments); overlay.hidden = false; syncOverlay();
  }
  function stop() { worker?.terminate(); worker = null; clearTimeout(timeout); }
  function rangeFor([start, end]) {
    const a = nodes.find(n => n.end > start) || nodes.at(-1);
    const b = nodes.find(n => n.end >= end) || nodes.at(-1);
    if (!a || !b) return null;
    const range = new Range(); range.setStart(a.node, Math.max(0, start - a.start)); range.setEnd(b.node, Math.max(0, end - b.start)); return range;
  }
  function show(scroll = true) {
    clear(); prev.disabled = next.disabled = !matches.length;
    count.textContent = matches.length ? `${index + 1} / ${matches.length}${matches.length === 10000 ? '+' : ''}` : (query.value ? '无匹配结果' : '请输入搜索文本');
    if (!matches.length) return;
    if (source) {
      highlightSource();
      if (!scroll) return;
      const [start, end] = matches[index]; editor.setSelectionRange(start, end);
      // A mirror measures wrapped lines without moving focus out of the search field.
      const mirror = document.createElement('div'), css = getComputedStyle(editor);
      Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: `${editor.clientWidth}px`, font: css.font, padding: css.padding, boxSizing: 'border-box', tabSize: css.tabSize });
      mirror.append(document.createTextNode(editor.value.slice(0, start)));
      const marker = document.createElement('span'); marker.textContent = '\u200b'; mirror.append(marker); document.body.append(mirror);
      editor.scrollTop = Math.max(0, marker.offsetTop - editor.clientHeight / 2); mirror.remove(); syncOverlay();
    } else {
      const ranges = matches.map(rangeFor).filter(Boolean), current = ranges[index];
      if (CSS.highlights) { CSS.highlights.set('search-results', new Highlight(...ranges)); if (current) CSS.highlights.set('search-current', new Highlight(current)); }
      if (scroll && current) {
        const host = document.querySelector(document.querySelector('.panes').dataset.view === 'live' ? '#live' : '#preview');
        const rect = current.getBoundingClientRect(); host.scrollTop += rect.top - host.getBoundingClientRect().top - host.clientHeight / 2;
      }
    }
  }
  function refresh(scroll = false) {
    stop(); clear(); if (bar.hidden) return;
    matches = []; index = -1; nodes = []; show(false);
    if (!query.value) return;
    const view = document.querySelector('.panes').dataset.view;
    source = view === 'edit' || view === 'split';
    let text = editor.value;
    if (!source) {
      text = '';
      const walker = document.createTreeWalker(document.querySelector(view === 'live' ? '#live' : '#preview'), NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement.closest('textarea, .katex-mathml, .live-placeholder, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      let previousBlock;
      while (walker.nextNode()) {
        const node = walker.currentNode; if (!node.textContent) continue;
        const block = node.parentElement.closest('p, h1, h2, h3, h4, h5, h6, li, pre, td, th, blockquote, .live-block');
        if (previousBlock && block !== previousBlock) text += '\n';
        previousBlock = block;
        const start = text.length; text += node.textContent; nodes.push({ node, start, end: text.length });
      }
    }
    count.textContent = '正在搜索…';
    worker = new Worker(new URL('./search-worker.js', import.meta.url), { type: 'module' });
    timeout = setTimeout(() => { stop(); count.textContent = '搜索耗时过长，请简化表达式'; }, 1500);
    worker.onerror = () => { stop(); count.textContent = '搜索失败，请重试'; };
    worker.onmessage = ({ data }) => { stop(); if (data.error) { count.textContent = data.error; return; } matches = data.matches; index = matches.length ? 0 : -1; show(scroll); };
    worker.postMessage({ text, query: query.value, caseSensitive: bar.querySelector('#search-case').checked, wholeWord: bar.querySelector('#search-word').checked, regex: bar.querySelector('#search-regex').checked });
  }
  function open() {
    if (bar.hidden) {
      previousFocus = document.activeElement;
      const selected = previousFocus instanceof HTMLTextAreaElement ? previousFocus.value.slice(previousFocus.selectionStart, previousFocus.selectionEnd) : window.getSelection()?.toString();
      if (selected && !selected.includes('\n')) query.value = selected;
    }
    bar.hidden = false; button.setAttribute('aria-expanded', 'true'); query.focus(); query.select(); refresh(true);
  }
  function close() { bar.hidden = true; button.setAttribute('aria-expanded', 'false'); stop(); clear(); if (previousFocus?.isConnected) previousFocus.focus(); else document.querySelector('#live .live-block')?.focus(); }
  function move(delta) { if (matches.length) { index = (index + delta + matches.length) % matches.length; show(); } }
  button.onclick = open; prev.onclick = () => move(-1); next.onclick = () => move(1); bar.querySelector('#search-close').onclick = close;
  bar.addEventListener('input', () => refresh(true));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !document.querySelector('dialog[open]')) { e.preventDefault(); open(); }
    else if (!bar.hidden && e.key === 'Escape') { e.preventDefault(); close(); }
    else if (!bar.hidden && ((bar.contains(e.target) && e.key === 'Enter') || e.key === 'F3')) { e.preventDefault(); move(e.shiftKey ? -1 : 1); }
  });
  return refresh;
}
