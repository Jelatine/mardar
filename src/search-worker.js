self.onmessage = ({ data: { text, query, caseSensitive, wholeWord, regex } }) => {
  try {
    const pattern = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(pattern, caseSensitive ? 'gu' : 'giu');
    const word = /[\p{L}\p{N}\p{M}_]/u;
    const matches = [];
    for (const match of text.matchAll(expression)) {
      const start = match.index, end = start + match[0].length;
      if (wholeWord && (word.test(text.slice(Math.max(0, start - 2), start).match(/.$/u)?.[0] || '') || word.test(String.fromCodePoint(text.codePointAt(end) || 0)))) continue;
      matches.push([start, end]);
      if (matches.length === 10000) break;
    }
    self.postMessage({ matches });
  } catch { self.postMessage({ error: '正则表达式无效' }); }
};
