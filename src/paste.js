// Convert rich clipboard HTML (Word, Excel, web pages) into Markdown source.
const blockTags = 'p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,table,thead,tbody,tfoot,tr,td,th,blockquote,pre,hr,section,article,header,footer,main,aside,nav,figure,figcaption,dl,dt,dd,address,details,summary,center';
const blockSet = new Set(blockTags.toUpperCase().split(','));
// Plain text is pasted as-is unless the HTML carries structure worth keeping.
const structure = 'table,h1,h2,h3,h4,h5,h6,ul,ol,b,strong,i,em,s,del,strike,a[href],img,blockquote,pre,code,hr,mark,sub,sup,[style*="mso-list"],[style*="font-weight"],[style*="font-style"]';
const TIGHT = '\u0001', BREAK = '\u0002';

const escapeText = text => text.replace(/[\\`*[\]<$~^]/g, '\\$&').replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\_').replace(/==/g, '\\==');
// Keep leading characters from being read as heading, quote, list or rule markers.
const escapeStart = text => text.replace(/^(?:#{1,6}(?=\s)|>|[-+](?=\s)|-{3,}$|={3,}$)/, '\\$&').replace(/^(\d+)([.)])(?=\s)/, '$1\\$2');
const isBlock = node => node.nodeType === 1 && (blockSet.has(node.tagName) || !!node.querySelector(blockTags));
const finish = (text, lineBreak) => text.replace(/ {2,}/g, ' ').replace(new RegExp(`(?:\\s*${BREAK}\\s*)+$|^(?:\\s*${BREAK}\\s*)+`, 'g'), '').replace(new RegExp(`\\s*${BREAK}\\s*`, 'g'), lineBreak).trim();
const join = parts => parts.map((part, i) => (i ? (part.startsWith(TIGHT) && parts[i - 1].startsWith(TIGHT) ? '\n' : '\n\n') : '') + part).join('').replaceAll(TIGHT, '');
const indent = (text, width) => text.replace(/\n(?!\n|$)/g, '\n' + ' '.repeat(width));

// Emphasis markers must hug the text, so surrounding whitespace moves outside them.
function wrap(text, marker, close = marker) {
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  return core ? `${lead}${marker}${core}${close}${trail}` : text;
}

function inline(node, context = {}) {
  if (node.nodeType === 3) return escapeText(node.textContent.replace(/[\s\u00a0]+/g, ' '));
  if (node.nodeType !== 1) return '';
  const tag = node.tagName, style = node.style;
  if (tag === 'BR') return BREAK;
  if (tag === 'IMG') {
    const src = node.getAttribute('src') || '';
    return /^(?:https?:\/\/|data:image\/)/i.test(src) ? `![${escapeText(node.getAttribute('alt') || '图片')}](<${src.replace(/[<>\s]/g, encodeURIComponent)}>)` : '';
  }
  if (['CODE', 'KBD', 'SAMP', 'TT'].includes(tag)) {
    const code = node.textContent.replace(/\s+/g, ' ').trim(), fence = code.includes('`') ? '``' : '`';
    return code ? `${fence}${fence.length > 1 ? ' ' : ''}${code}${fence.length > 1 ? ' ' : ''}${fence}` : '';
  }
  if (['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'SVG', 'svg'].includes(tag) || /mso-list:\s*ignore/i.test(node.getAttribute('style') || '')) return '';
  const weight = style.fontWeight, plain = weight === 'normal' || (weight !== '' && +weight < 600);
  const bold = !context.bold && ((['B', 'STRONG'].includes(tag) && !plain) || weight === 'bold' || +weight >= 600);
  const italic = !context.italic && ((['I', 'EM'].includes(tag) && style.fontStyle !== 'normal') || style.fontStyle === 'italic');
  const strike = !context.strike && (['S', 'DEL', 'STRIKE'].includes(tag) || /line-through/.test(style.textDecoration + style.textDecorationLine));
  const inner = { bold: context.bold || bold, italic: context.italic || italic, strike: context.strike || strike };
  let text = [...node.childNodes].map(child => inline(child, inner)).join('');
  if (tag === 'A') {
    const href = node.getAttribute('href') || '';
    if (/^(?:https?:\/\/|mailto:)/i.test(href) && text.trim()) text = wrap(text, '[', `](<${href.replace(/[<>\s]/g, encodeURIComponent)}>)`);
  }
  if (tag === 'SUB') text = wrap(text, '~');
  if (tag === 'SUP') text = wrap(text, '^');
  if (tag === 'MARK') text = wrap(text, '==');
  if (strike) text = wrap(text, '~~');
  if (italic) text = wrap(text, '*');
  if (bold) text = wrap(text, '**');
  return text;
}

function blocks(parent, context) {
  const out = []; let run = [];
  const flush = () => { const text = finish(run.map(node => inline(node, context)).join(''), '  \n'); if (text) out.push(escapeStart(text)); run = []; };
  for (const node of parent.childNodes) {
    if (isBlock(node)) { flush(); out.push(...block(node, context)); } else run.push(node);
  }
  flush(); return out;
}

function list(node, context) {
  const ordered = node.tagName === 'OL', items = []; let number = Number(node.getAttribute('start')) || 1;
  for (const child of node.children) {
    // Some editors nest a list directly inside its parent list.
    if (['UL', 'OL'].includes(child.tagName)) { if (items.length) items[items.length - 1] += '\n' + indent(list(child, context), 4).replace(/^/, '    '); else items.push(list(child, context)); continue; }
    const marker = ordered ? `${number++}. ` : '- ', box = child.querySelector('input[type=checkbox], .task-box');
    const task = box ? (box.checked || box.hasAttribute('checked') || box.getAttribute('aria-checked') === 'true' ? '[x] ' : '[ ] ') : '';
    const parts = blocks(child, context).map((part, i) => (i && /^(?:- |\d+\. )/.test(part) ? TIGHT : '') + part);
    const body = parts.map((part, i) => (i ? (part.startsWith(TIGHT) ? '\n' : '\n\n') : '') + part.replace(TIGHT, '')).join('');
    items.push(marker + task + indent(body, marker.length));
  }
  return items.join('\n');
}

function table(node, context) {
  const grid = [], aligns = [], rows = [...node.rows];
  rows.forEach((row, r) => {
    grid[r] ||= []; let c = 0;
    for (const cell of row.cells) {
      while (grid[r][c] !== undefined) c++;
      const text = join(blocks(cell, context)).replace(/\s*\n\s*/g, '<br>').replace(/\|/g, '\\|');
      const rowSpan = Math.min(cell.rowSpan || 1, rows.length - r), colSpan = Math.min(cell.colSpan || 1, 100);
      // Markdown tables cannot merge cells: keep the text in the first cell and leave the rest empty.
      for (let i = 0; i < rowSpan; i++) for (let j = 0; j < colSpan; j++) (grid[r + i] ||= [])[c + j] = i || j ? '' : text;
      if (!r) aligns[c] = cell.style.textAlign || cell.getAttribute('align') || '';
      c += colSpan;
    }
  });
  const width = Math.max(0, ...grid.map(row => row.length));
  if (!width) return [];
  // A single cell is page layout, not data.
  if (width === 1 && grid.length === 1) return blocks(rows[0].cells[0], context);
  const line = cells => `| ${Array.from({ length: width }, (_, i) => cells[i] || ' ').join(' | ')} |`;
  const rule = Array.from({ length: width }, (_, i) => ({ center: ':---:', right: '---:', left: ':---' })[aligns[i]] || '---');
  return [[line(grid[0]), line(rule), ...grid.slice(1).map(line)].join('\n')];
}

function block(node, context) {
  const tag = node.tagName, style = node.getAttribute('style') || '';
  if (/^H[1-6]$/.test(tag)) { const text = finish(inline(node, { ...context, bold: true }), ' '); return text ? [`${'#'.repeat(+tag[1])} ${text}`] : []; }
  if (tag === 'UL' || tag === 'OL') { const text = list(node, context); return text ? [text] : []; }
  if (tag === 'TABLE') return table(node, context);
  if (tag === 'HR') return ['---'];
  if (tag === 'BLOCKQUOTE') { const text = join(blocks(node, context)); return text ? [text.replace(/^/gm, '> ').replace(/^> $/gm, '>')] : []; }
  if (tag === 'PRE') {
    const code = node.textContent.replace(/\n$/, ''), fence = code.includes('```') ? '````' : '```';
    const language = /language-([\w+#-]+)/.exec(node.querySelector('code')?.className || node.className)?.[1] || '';
    return code.trim() ? [`${fence}${language}\n${code}\n${fence}`] : [];
  }
  // Word writes list items as paragraphs carrying a level and a literal marker.
  const level = /mso-list:[^;"']*level(\d+)/i.exec(style);
  if (level) {
    const marker = [...node.querySelectorAll('[style]')].find(el => /mso-list:\s*ignore/i.test(el.getAttribute('style')))?.textContent.trim() || '';
    const text = finish(inline(node, context), '  \n');
    return text ? [`${TIGHT}${'    '.repeat(level[1] - 1)}${/^(?:\d+|[a-z]{1,3})[.)、]/i.test(marker) || /^[(（]/.test(marker) ? '1.' : '-'} ${indent(text, 4 * level[1])}`] : [];
  }
  return blocks(node, context);
}

// Returns Markdown, or null when the HTML is plain text (or source code) better pasted verbatim.
export function htmlToMarkdown(html) {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  body.querySelectorAll('script,style,meta,link,title,template,noscript').forEach(node => node.remove());
  // Code editors copy syntax-coloured lines; their plain text is the faithful version.
  if (!body.querySelector(structure) || body.querySelector(':scope > [style*="white-space: pre"], :scope > [style*="white-space:pre"]')) return null;
  return join(blocks(body, {})) || null;
}
