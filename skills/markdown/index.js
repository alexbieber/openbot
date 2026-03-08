import { writeFileSync } from 'fs';

function mdToHtml(md) {
  return md
    .replace(/^#{6}\s(.+)/gm, '<h6>$1</h6>')
    .replace(/^#{5}\s(.+)/gm, '<h5>$1</h5>')
    .replace(/^#{4}\s(.+)/gm, '<h4>$1</h4>')
    .replace(/^#{3}\s(.+)/gm, '<h3>$1</h3>')
    .replace(/^#{2}\s(.+)/gm, '<h2>$1</h2>')
    .replace(/^#{1}\s(.+)/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)/gm, '<li>$2</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hl]|<li|<p|<\/p)(.+)/gm, '<p>$1</p>');
}

function mdToText(md) {
  return md
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
    .replace(/^- /gm, '• ')
    .trim();
}

function extractTOC(md) {
  const headings = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^(#{1,6})\s(.+)/);
    if (m) {
      const level = m[1].length;
      const title = m[2].trim();
      const anchor = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      headings.push({ level, title, anchor, indent: '  '.repeat(level - 1) });
    }
  }
  return headings;
}

export default {
  name: 'markdown',
  async run({ action = 'to_html', content, outputPath }) {
    if (!content) return { ok: false, error: 'content is required' };

    let result;
    switch (action) {
      case 'to_html': result = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>${mdToHtml(content)}</body></html>`; break;
      case 'to_text': result = mdToText(content); break;
      case 'from_html':
        result = content
          .replace(/<h([1-6])>(.*?)<\/h\1>/gi, (_, l, t) => `${'#'.repeat(l)} ${t}\n`)
          .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
          .replace(/<em>(.*?)<\/em>/gi, '*$1*')
          .replace(/<code>(.*?)<\/code>/gi, '`$1`')
          .replace(/<a href="(.*?)">(.*?)<\/a>/gi, '[$2]($1)')
          .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
          .replace(/<[^>]+>/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        break;
      case 'toc': {
        const toc = extractTOC(content);
        result = toc.map(h => `${h.indent}- [${h.title}](#${h.anchor})`).join('\n');
        return { ok: true, toc, output: result };
      }
      case 'to_pdf':
        try {
          const PDFDocument = (await import('pdfkit')).default;
          const buf = await new Promise((resolve, reject) => {
            const doc = new PDFDocument();
            const chunks = [];
            doc.on('data', c => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            doc.fontSize(12).text(mdToText(content));
            doc.end();
          });
          if (outputPath) { writeFileSync(outputPath, buf); return { ok: true, savedTo: outputPath, size: buf.length }; }
          return { ok: true, base64: buf.toString('base64'), size: buf.length };
        } catch { return { ok: false, error: 'pdfkit not installed. Run: npm install pdfkit' }; }
      default: return { ok: false, error: `Unknown action: ${action}` };
    }

    if (outputPath) { writeFileSync(outputPath, result, 'utf-8'); return { ok: true, savedTo: outputPath }; }
    return { ok: true, output: result };
  },
};
