export function escapeRegex(text: string): string {
  return text.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

// ref: https://github.com/markedjs/marked/blob/4a855a8cfb3e77f96a0727dfe8fe042fea658a11/src/helpers.ts#L35
const unescapeTest = /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/gi;

export function unescapeHtml(html: string): string {
  return html.replace(unescapeTest, (_, n) => {
    n = n.toLowerCase();
    if (n === 'colon') return ':';
    if (n.charAt(0) === '#') {
      return n.charAt(1) === 'x'
        ? String.fromCharCode(parseInt(n.substring(2), 16))
        : String.fromCharCode(+n.substring(1));
    }
    return '';
  });
}
