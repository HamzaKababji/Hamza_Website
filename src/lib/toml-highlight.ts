// Tiny TOML syntax highlighter for the PAGE / .TOML switches. Returns escaped HTML with
// span classes styled by .toml in global.css: h (table), k (key), s (string), n (number/bool), c (comment).
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function values(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) j += src[j] === '\\' && ch === '"' ? 2 : 1;
      out += `<span class="s">${esc(src.slice(i, j + 1))}</span>`;
      i = j + 1;
    } else if (ch === '#') {
      out += `<span class="c">${esc(src.slice(i))}</span>`;
      break;
    } else {
      const m = /^(true|false|[+-]?\d[\d_.:eE+-]*)/.exec(src.slice(i));
      const prev = src[i - 1];
      if (m && (!prev || /[\s=,[{]/.test(prev))) {
        out += `<span class="n">${esc(m[0])}</span>`;
        i += m[0].length;
      } else {
        out += esc(ch);
        i++;
      }
    }
  }
  return out;
}

export function highlightToml(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n+$/, '')
    .split('\n')
    .map((line) => {
      const header = /^(\s*)(\[\[?[^\]]+\]\]?)(.*)$/.exec(line);
      if (header) return `${header[1]}<span class="h">${esc(header[2])}</span>${values(header[3])}`;
      const kv = /^(\s*)([A-Za-z0-9_."-]+)(\s*=)(.*)$/.exec(line);
      if (kv) return `${kv[1]}<span class="k">${esc(kv[2])}</span>${esc(kv[3])}${values(kv[4])}`;
      return values(line);
    })
    .join('\n');
}
