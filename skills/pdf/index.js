/**
 * PDF Skill
 * Read PDFs (pdf-parse) or create PDFs (pdfkit).
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp';

export default async function execute({ action, path: filePath, content, title = 'Document' }) {
  switch (action) {
    case 'read': return readPdf(filePath);
    case 'create': return createPdf(content, filePath, title);
    default: throw new Error(`Unknown action: ${action}. Use: read, create`);
  }
}

async function readPdf(filePath) {
  if (!filePath) throw new Error('path is required for read');
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
  const buffer = readFileSync(filePath);
  const data = await pdfParse(buffer);

  return `PDF: ${filePath}
Pages: ${data.numpages}
Words: ~${data.text.split(/\s+/).length}

--- Content ---
${data.text.substring(0, 8000)}${data.text.length > 8000 ? '\n\n[...truncated — file has more content]' : ''}`;
}

async function createPdf(content, outputPath, title) {
  if (!content) throw new Error('content is required for create');
  const savePath = outputPath || join(HOME, '.openbot', `${title.replace(/\s+/g, '-')}-${Date.now()}.pdf`);

  const { default: PDFDocument } = await import('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      writeFileSync(savePath, Buffer.concat(chunks));
      resolve(`✅ PDF created: ${savePath}`);
    });
    doc.on('error', reject);

    doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica');

    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith('## ')) {
        doc.moveDown(0.5).font('Helvetica-Bold').fontSize(14).text(line.replace('## ', '')).font('Helvetica').fontSize(12);
      } else if (line.startsWith('# ')) {
        doc.moveDown(0.5).font('Helvetica-Bold').fontSize(16).text(line.replace('# ', '')).font('Helvetica').fontSize(12);
      } else {
        doc.text(line || ' ');
      }
    }
    doc.end();
  });
}
