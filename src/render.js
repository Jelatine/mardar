import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import footnote from 'markdown-it-footnote';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import { full as emoji } from 'markdown-it-emoji';
const diagramFont = 'PingFang SC, Microsoft YaHei, Noto Sans CJK SC, Segoe UI, sans-serif';
let diagramQueue = Promise.resolve();
function renderDiagram(id, source, dark) {
  const pending = diagramQueue.then(async () => {
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: diagramFont,
      themeVariables: {
        darkMode: dark, background: dark ? '#202820' : '#ffffff',
        primaryColor: dark ? '#344b3c' : '#edf5ef', primaryTextColor: dark ? '#e0ecdf' : '#293d2d',
        primaryBorderColor: dark ? '#7eaf8e' : '#6c977a', lineColor: dark ? '#a0bea7' : '#64856d',
        secondaryColor: dark ? '#39463b' : '#f4f6ed', tertiaryColor: dark ? '#2b382e' : '#f7faf5',
        textColor: dark ? '#e0ecdf' : '#293d2d', edgeLabelBackground: dark ? '#273329' : '#f7faf5',
        clusterBkg: dark ? '#273329' : '#f7faf5', clusterBorder: dark ? '#536b57' : '#cadbcb', fontSize: '14px',
      },
      htmlLabels: false, flowchart: { htmlLabels: false, curve: 'basis', nodeSpacing: 40, rankSpacing: 50, padding: 18 },
    });
    return mermaid.render(id, source);
  });
  diagramQueue = pending.catch(() => {});
  return pending;
}

export function assignHeadingIds(root) {
  const used = new Set();
  for (const heading of root.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const slug = heading.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-') || 'section';
    let id = slug, suffix = 0;
    while (used.has(id)) id = `${slug}-${++suffix}`;
    used.add(id); heading.id = id;
  }
}

const md = new MarkdownIt({ html: true, linkify: true, typographer: true, highlight(code, lang) {
  return lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : md.utils.escapeHtml(code);
}}).use(texmath, { engine: katex, delimiters: 'dollars', katexOptions: { throwOnError: false, trust: false } }).use(footnote).use(mark).use(sub).use(sup).use(emoji);
// Anchor footnotes by label so references resolve across separately rendered live blocks.
md.renderer.rules.footnote_anchor_name = (tokens, i) => { const { label, id } = tokens[i].meta; return label ? label.replace(/[^\p{L}\p{N}_-]/gu, '-') : `-${id + 1}`; };
// YAML front matter: a `---` fence on the first line of the document, closed by `---` or `...`.
md.block.ruler.before('table', 'front_matter', (state, startLine, endLine, silent) => {
  const line = n => state.src.slice(state.bMarks[n], state.eMarks[n]).trimEnd();
  if (startLine !== 0 || state.level || state.env.fragment || line(0) !== '---') return false;
  let close = 1;
  while (close < endLine && line(close) !== '---' && line(close) !== '...') close++;
  if (close >= endLine) return false;
  if (silent) return true;
  const token = state.push('front_matter', 'pre', 0);
  token.map = [0, close + 1]; token.content = state.getLines(1, close, 0, true); state.line = close + 1;
  return true;
});
md.renderer.rules.front_matter = (tokens, i, options, env, self) => `<pre class="front-matter"${self.renderAttrs(tokens[i])}><code>${hljs.highlight(tokens[i].content, { language: 'yaml' }).value}</code></pre>\n`;
// Task lists draw their own box: form controls are stripped from documents.
md.core.ruler.after('inline', 'task_lists', state => {
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const text = tokens[i].children?.[0];
    if (tokens[i].type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open' || text?.type !== 'text') continue;
    const match = /^\[([ xX])\]\s+/.exec(text.content);
    if (!match) continue;
    text.content = text.content.slice(match[0].length);
    const box = new state.Token('html_inline', '', 0);
    box.content = `<span class="task-box" role="checkbox" aria-checked="${match[1] !== ' '}"></span>`;
    tokens[i].children.unshift(box); tokens[i - 2].attrJoin('class', 'task-item');
  }
});
const validateLink = md.validateLink;
// Preserve local images and document links; link clicks are handled by the app
// instead of allowing browser navigation. Other attributes use the sanitizer.
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (node.tagName === 'IMG' && data.attrName === 'src' && /^file:\/\//i.test(data.attrValue)) data.forceKeepAttr = true;
  if (node.tagName === 'A' && data.attrName === 'href' && /^file:\/\//i.test(data.attrValue)) data.forceKeepAttr = true;
});
md.validateLink = url => /^file:\/\//i.test(url) || /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(url) || validateLink(url);
md.core.ruler.push('source_positions', state => {
  for (const token of state.tokens) if (token.map && token.nesting !== -1) {
    token.attrSet('data-source-line', String(token.map[0]));
    token.attrSet('data-source-end', String(token.map[1]));
  }
});
const fence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, i, options, env, self) => tokens[i].info.trim() === 'mermaid' ? `<pre class="mermaid" data-source-line="${tokens[i].map[0]}" data-source-end="${tokens[i].map[1]}">${md.utils.escapeHtml(tokens[i].content)}</pre>` : fence(tokens, i, options, env, self);
let counter = 0;
function followAnchor(event) {
  event.preventDefault();
  const a = event.currentTarget, href = a.getAttribute('href');
  if (!href?.startsWith('#')) return;
  let id;
  try { id = decodeURIComponent(href.slice(1)); } catch { return; }
  const host = a.closest('#live, #preview') || a.getRootNode();
  [...host.querySelectorAll('[id]')].find(el => el.id === id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
// Fill every `[toc]` placeholder under root from the headings found there.
export function fillToc(root) {
  const headings = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(h => h.id);
  const top = Math.min(...headings.map(h => +h.tagName[1]));
  for (const nav of root.querySelectorAll('nav.toc')) {
    nav.replaceChildren();
    if (!headings.length) { nav.textContent = '目录：文档中还没有标题'; continue; }
    for (const heading of headings) {
      const a = document.createElement('a'); a.href = `#${encodeURIComponent(heading.id)}`; a.textContent = heading.textContent;
      a.style.paddingLeft = `${(+heading.tagName[1] - top) * 18}px`; a.addEventListener('click', followAnchor); nav.append(a);
    }
  }
}
// Number footnotes across live blocks in order of first reference.
export function numberFootnotes(root) {
  const numbers = new Map(), number = key => numbers.get(key) || numbers.set(key, numbers.size + 1).get(key);
  for (const a of root.querySelectorAll('.footnote-ref a')) a.textContent = `[${number(a.getAttribute('href').slice(1))}]`;
  for (const item of root.querySelectorAll('.footnote-item')) item.value = number(item.id);
}
const noteDefinition = /^\[\^([^\]\s]+)\]:/gm;
export const isNoteDefinition = text => /^\[\^[^\]\s]+\]:/.test(text);
// Live blocks render in isolation; lend each one the footnote text it needs.
// `notes` holds every definition in the document, `fragment` marks blocks after the first.
export async function renderBlock(text, base, notes, fragment) {
  const definition = isNoteDefinition(text);
  if (!definition && !(notes && text.includes('[^'))) return renderDocument(text, 'markdown', base, { fragment });
  const references = [...text.matchAll(noteDefinition)].map(match => `[^${match[1]}]`).join(' ');
  const root = await renderDocument(`${text.trimEnd()}\n\n${definition ? references : notes}`, 'markdown', base, { fragment });
  if (definition) { const rule = root.querySelector('.footnotes-sep'); rule?.previousElementSibling?.remove(); rule?.remove(); }
  else root.querySelectorAll('.footnotes-sep, .footnotes').forEach(node => node.remove());
  return root;
}
export async function renderDocument(source, format, base, env = {}) {
  const dark = document.body.classList.contains('dark');
  const root = document.createElement('article'); root.className = 'prose';
  root.innerHTML = DOMPurify.sanitize(md.render(source, { ...env }), { ADD_TAGS: ['eq', 'eqn', 'annotation', 'semantics'], ADD_ATTR: ['encoding'], FORBID_TAGS: ['style', 'input', 'form'], FORBID_ATTR: ['style', 'srcset'] });
  const raw = document.createElement('template'); raw.innerHTML = DOMPurify.sanitize(md.render(source, { ...env }));
  const originals = [...raw.content.querySelectorAll('img')];
  root.querySelectorAll('img').forEach((img, i) => {
    const style = originals[i]?.style;
    for (const key of ['zoom', 'width', 'height', 'maxWidth']) {
      const value = style?.[key];
      if (value && /^(?:[0-9]+(?:\.[0-9]+)?(?:%|px|em|rem)?|auto)$/.test(value)) img.style[key] = value;
    }
  });
  // Restore only styles generated by KaTeX after removing document-provided CSS.
  for (const formula of root.querySelectorAll('.katex')) {
    const expression = formula.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
    if (expression) {
      const displayMode = formula.parentElement.classList.contains('katex-display');
      const span = document.createElement('span');
      katex.render(expression, span, { throwOnError: false, trust: false, displayMode });
      (displayMode ? formula.parentElement : formula).replaceWith(span);
    }
  }

  for (const p of root.querySelectorAll(':scope > p')) {
    if (p.childElementCount || !/^\[toc\]$/i.test(p.textContent.trim())) continue;
    const nav = document.createElement('nav'); nav.className = 'toc';
    Object.assign(nav.dataset, p.dataset); p.replaceWith(nav);
  }
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src');
    if (base && src && !/^[a-z]+:|^\/\//i.test(src)) img.src = new URL(src, base).href;
    img.addEventListener('error', () => { img.alt = `图片无法加载：${img.alt || src}`; });
  }
  for (const node of root.querySelectorAll('.mermaid')) {
    const id = `diagram-${++counter}`;
    try { const { svg } = await renderDiagram(id, node.textContent, dark); node.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true, html: true } }); }
    catch { document.getElementById(`d${id}`)?.remove(); node.className = 'diagram-error'; node.textContent = '图表语法有误，请检查 Mermaid 代码。'; }
  }
  assignHeadingIds(root);
  root.querySelectorAll('a').forEach(a => a.addEventListener('click', followAnchor));
  fillToc(root);
  return root;
}

export function sourceBlocks(source) {
  const lines = source.split('\n'), offsets = [0];
  for (const line of lines) offsets.push(offsets.at(-1) + line.length + 1);
  const blocks = md.parse(source, {}).filter(t => t.level === 0 && t.map), covered = new Set();
  for (const { map } of blocks) for (let line = map[0]; line < map[1]; line++) covered.add(line);
  // Footnote definitions leave the token stream; give each one its own block.
  const notes = lines.flatMap((line, i) => !covered.has(i) && isNoteDefinition(line) ? [offsets[i]] : []);
  const starts = [...new Set([...blocks.map(t => offsets[t.map[0]]), ...notes])].sort((a, b) => a - b);
  if (starts[0] !== 0) starts.unshift(0);
  return starts.map((start, i) => ({ start, text: source.slice(start, starts[i + 1] ?? source.length) }));
}
