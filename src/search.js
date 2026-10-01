export function setupSearch(editor, { changed, status, sourceView }) {
  const bar = document.createElement('section');
  bar.className = 'search-bar'; bar.hidden = true; bar.setAttribute('aria-label', '文本搜索');
  bar.innerHTML = `<button id="replace-toggle" aria-label="替换" aria-expanded="false" aria-controls="replace-row" title="替换（Ctrl+H / ⌥⌘F）"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg></button><div class="search-field"><input id="search-query" type="text" aria-label="搜索文本" placeholder="查找" autocomplete="off" spellcheck="false"><div class="search-options"><label title="区分大小写" aria-label="区分大小写"><input type="checkbox" id="search-case" aria-label="大小写匹配"><span aria-hidden="true">Aa</span></label><label title="全词匹配" aria-label="全词匹配"><input type="checkbox" id="search-word" aria-label="全词匹配"><span class="search-word-icon" aria-hidden="true">ab</span></label><label title="使用正则表达式" aria-label="使用正则表达式"><input type="checkbox" id="search-regex" aria-label="正则表达式"><span aria-hidden="true">.*</span></label></div></div><span id="search-count" role="status" aria-live="polite"></span><div class="search-navigation"><button id="search-prev" aria-label="上一个匹配" title="上一个（Shift+Enter）"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg></button><button id="search-next" aria-label="下一个匹配" title="下一个（Enter）"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3.5 8.5 8 13l4.5-4.5"/></svg></button><button id="search-close" aria-label="关闭搜索" title="关闭（Esc）"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg></button></div><div class="replace-row" id="replace-row" hidden><div class="search-field"><input id="replace-text" type="text" aria-label="替换为" placeholder="替换为" autocomplete="off" spellcheck="false"></div><button id="replace-one" class="text-button" title="替换当前匹配（Enter）">替换</button><button id="replace-all" class="text-button">全部替换</button></div>`;
  document.querySelector('.panes').prepend(bar);
  const button = document.createElement('button'); button.id = 'search-toggle'; button.title = '搜索（Ctrl+F / ⌘F）';
  button.setAttribute('aria-label', '搜索'); button.setAttribute('aria-expanded', 'false');
  bar.id = 'search-bar'; button.setAttribute('aria-controls', bar.id);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
  document.querySelector('.toolbar-actions').prepend(button);
  const query = bar.querySelector('#search-query'), count = bar.querySelector('#search-count');
  const prev = bar.querySelector('#search-prev'), next = bar.querySelector('#search-next');
  const toggle = bar.querySelector('#replace-toggle'), row = bar.querySelector('#replace-row'), field = bar.querySelector('#replace-text');
  const one = bar.querySelector('#replace-one'), all = bar.querySelector('#replace-all');
  // `searched` is the source text the current matches belong to; `anchor` keeps
  // the position after a replacement so the next match follows it.
  let worker, timeout, matches = [], index = -1, nodes = [], source = false, previousFocus, pointerSelection, searched = '', anchor = null;
  function selectedText() {
    const focused = document.activeElement;
    if (focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement) return focused.value.slice(focused.selectionStart, focused.selectionEnd);
    return window.getSelection()?.toString() || '';
  }
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
    clear(); prev.disabled = next.disabled = !matches.length; one.disabled = all.disabled = !source || !matches.length;
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
    const view = document.querySelector('.panes').dataset.view;
    if (source !== (source = view === 'edit' || view === 'split')) anchor = null;
    // Replacement edits Markdown source, so it is only offered in the source views.
    if (!source) showReplace(false);
    matches = []; index = -1; nodes = []; show(false);
    if (!query.value) return;
    let text = searched = editor.value;
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
    worker.onmessage = ({ data }) => { stop(); if (data.error) { count.textContent = data.error; return; } matches = data.matches; index = matches.length ? Math.max(0, anchor == null ? 0 : matches.findIndex(match => match[0] >= anchor)) : -1; show(scroll); };
    worker.postMessage({ text, query: query.value, caseSensitive: bar.querySelector('#search-case').checked, wholeWord: bar.querySelector('#search-word').checked, regex: bar.querySelector('#search-regex').checked });
  }
  function showReplace(on) { row.hidden = !on; toggle.setAttribute('aria-expanded', String(on)); }
  async function setReplace(on) { if (on && !source) await sourceView(); showReplace(on); }
  // Regex replacements expand $1, $<name>, $& and $$ like String.prototype.replace.
  function replacer() {
    const value = field.value;
    if (!bar.querySelector('#search-regex').checked) return () => value;
    const expression = new RegExp(query.value, bar.querySelector('#search-case').checked ? 'uy' : 'iuy');
    return ([start, end]) => {
      expression.lastIndex = start;
      const found = expression.exec(searched);
      if (!found) return searched.slice(start, end);
      return value.replace(/\$(\$|&|\d{1,2}|<[^>]*>)/g, (token, key) => {
        if (key === '$') return '$';
        if (key === '&') return found[0];
        if (key[0] === '<') return found.groups?.[key.slice(1, -1)] ?? '';
        if (+key > 0 && +key < found.length) return found[+key] ?? '';
        return key.length === 2 && +key[0] > 0 && +key[0] < found.length ? (found[+key[0]] ?? '') + key[1] : token;
      });
    };
  }
  function replace(everything) {
    // Matches computed for older text are refreshed shortly; never apply them.
    if (!source || !matches.length || editor.value !== searched) return;
    const text = replacer();
    if (everything) {
      let result = '', offset = 0;
      for (const match of matches) { result += searched.slice(offset, match[0]) + text(match); offset = match[1]; }
      editor.value = result + searched.slice(offset); anchor = null;
      status(`已替换 ${matches.length} 处${matches.length === 10000 ? '，可再次执行替换其余匹配' : ''}`);
    } else {
      const [start, end] = matches[index], value = text(matches[index]);
      editor.setRangeText(value, start, end, 'end'); anchor = start + value.length;
    }
    changed(); refresh(true);
  }
  function open(replacing = false) {
    if (bar.hidden) {
      previousFocus = pointerSelection?.focus || document.activeElement;
      const selected = pointerSelection?.text ?? selectedText();
      if (selected && !selected.includes('\n')) query.value = selected;
    }
    pointerSelection = undefined;
    bar.hidden = false; button.setAttribute('aria-expanded', 'true'); query.focus(); query.select(); refresh(true);
    if (replacing) setReplace(true);
  }
  function close() { bar.hidden = true; button.setAttribute('aria-expanded', 'false'); stop(); clear(); if (previousFocus?.isConnected) previousFocus.focus(); else document.querySelector('#live .live-block')?.focus(); }
  function move(delta) { anchor = null; if (matches.length) { index = (index + delta + matches.length) % matches.length; show(); } }
  button.addEventListener('pointerdown', () => { pointerSelection = { focus: document.activeElement, text: selectedText() }; });
  button.onclick = () => open(); toggle.onclick = () => setReplace(row.hidden); one.onclick = () => replace(false); all.onclick = () => replace(true); prev.onclick = () => move(-1); next.onclick = () => move(1); bar.querySelector('#search-close').onclick = close;
  bar.addEventListener('input', e => { if (e.target !== field) { anchor = null; refresh(true); } });
  const mac = /Mac/.test(navigator.platform);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !document.querySelector('dialog[open]')) { e.preventDefault(); open(); }
    else if ((mac ? e.metaKey && e.altKey && e.code === 'KeyF' : e.ctrlKey && e.key.toLowerCase() === 'h') && !document.querySelector('dialog[open]')) { e.preventDefault(); open(true); }
    else if (!bar.hidden && e.target === field && e.key === 'Enter') { e.preventDefault(); replace(false); }
    else if (!bar.hidden && e.key === 'Escape') { e.preventDefault(); close(); }
    else if (!bar.hidden && ((bar.contains(e.target) && e.key === 'Enter') || e.key === 'F3')) { e.preventDefault(); move(e.shiftKey ? -1 : 1); }
  });
  return refresh;
}
