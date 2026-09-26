export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'link'; url: string; children: InlineNode[] };

export type MarkdownBlock =
  | { type: 'heading'; level: number; children: InlineNode[] }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] };

function sanitize(markdown: string): string {
  return markdown
    .replace(/<!--[^]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '');
}

export function isAllowedLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function parseInline(value: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const token = /(\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_)/g;
  let cursor = 0;
  for (const match of value.matchAll(token)) {
    const index = match.index;
    if (index > cursor) nodes.push({ type: 'text', text: value.slice(cursor, index) });
    const full = match[0];
    const label = match[2];
    const url = match[3];
    if (label !== undefined && url !== undefined) {
      nodes.push(isAllowedLink(url)
        ? { type: 'link', url, children: parseInline(label) }
        : { type: 'text', text: label });
    } else {
      const bold = match[4] ?? match[5];
      const italic = match[6] ?? match[7];
      if (bold !== undefined) nodes.push({ type: 'bold', children: parseInline(bold) });
      else if (italic !== undefined) nodes.push({ type: 'italic', children: parseInline(italic) });
    }
    cursor = index + full.length;
  }
  if (cursor < value.length) nodes.push({ type: 'text', text: value.slice(cursor) });
  return nodes;
}

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = sanitize(markdown).replaceAll('\r\n', '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '') { index += 1; continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading?.[1] !== undefined && heading[2] !== undefined) {
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2].trim()) });
      index += 1;
      continue;
    }
    const list = /^\s*(?:(\d+)[.)]|[-+*])\s+(.+)$/.exec(line);
    if (list !== null) {
      const ordered = list[1] !== undefined;
      const items: InlineNode[][] = [];
      while (index < lines.length) {
        const current = /^\s*(?:(\d+)[.)]|[-+*])\s+(.+)$/.exec(lines[index] ?? '');
        if (current === null || (current[1] !== undefined) !== ordered || current[2] === undefined) break;
        items.push(parseInline(current[2].trim()));
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? '';
      if (next.trim() === '' || /^(#{1,6})\s+/.test(next) || /^\s*(?:(\d+)[.)]|[-+*])\s+/.test(next)) break;
      paragraph.push(next.trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) });
  }
  return blocks;
}
