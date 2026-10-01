import type { DateKey } from '../domain/types';
import { parseWhen } from '../nlp/when';
import { isDateKey } from '../utils/dates';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Stored text is capped so one document can't exhaust the database. */
export const MAX_STORED_CHARS = 200_000;
export const ACCEPT = '.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.pdf,.docx,text/plain,text/markdown,text/csv,application/json,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export class DocumentError extends Error {}

function readAsText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
function readAsBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  return (doc.body?.innerText || doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n');
}

async function pdfToText(file: Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const Worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?worker&inline')).default;
  if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new Worker();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await readAsBuffer(file)) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 300); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : '')).join(''));
  }
  return pages.join('\n\n');
}

async function docxToText(file: Blob): Promise<string> {
  const mammoth = await import('mammoth');
  const res = await mammoth.extractRawText({ arrayBuffer: await readAsBuffer(file) });
  return res.value;
}

/** Extracts plain text from a supported file. Everything runs locally in the browser. */
export async function extractText(file: File): Promise<{ text: string; truncated: boolean }> {
  if (file.size > MAX_UPLOAD_BYTES) throw new DocumentError('That file is larger than 15 MB. Try a smaller file or an excerpt.');
  const name = file.name.toLowerCase();
  let text: string;
  try {
    if (name.endsWith('.pdf') || file.type === 'application/pdf') text = await pdfToText(file);
    else if (name.endsWith('.docx')) text = await docxToText(file);
    else if (name.endsWith('.html') || name.endsWith('.htm') || file.type === 'text/html') text = htmlToText(await readAsText(file));
    else if (/\.(txt|md|markdown|csv|tsv|json|log)$/.test(name) || file.type.startsWith('text/') || file.type === 'application/json') text = await readAsText(file);
    else throw new DocumentError('That file type isn’t supported. Use PDF, Word (.docx), text, Markdown, CSV, JSON or HTML.');
  } catch (e) {
    if (e instanceof DocumentError) throw e;
    throw new DocumentError('The file couldn’t be read. It may be damaged, password-protected or a scanned image without text.');
  }
  text = text.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!text) throw new DocumentError('No readable text was found in that file. Scanned PDFs need text recognition first.');
  return { text: text.slice(0, MAX_STORED_CHARS), truncated: text.length > MAX_STORED_CHARS };
}

export interface DocumentAnalysis {
  summary: string;
  keyPoints: string[];
  actionItems: { title: string; dueDate?: DateKey }[];
  deadlines: { what: string; date: DateKey }[];
}

const sentences = (text: string) =>
  text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/).map((s) => s.trim()).filter((s) => s.length > 3);

const ACTION = /\b(must|need(?:s)? to|should|have to|required to|to-?do|action:|please|deliver|submit|prepare|complete|finali[sz]e|review|send|draft|create|update|schedule|set up|book|confirm|follow up|due)\b/i;

/**
 * Offline analysis used when AI isn’t available: picks leading sentences as a summary, flags
 * sentences and bullet points that read like instructions, and collects dated statements.
 * It is heuristic and labelled as such in the UI.
 */
export function analyseLocally(text: string, now = new Date()): DocumentAnalysis {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^([-*•]|\d+[.)]|\[ ?\])\s+/.test(l)).map((l) => l.replace(/^([-*•]|\d+[.)]|\[ ?\])\s+/, ''));
  const sents = sentences(text);
  const summary = sents.slice(0, 3).join(' ').slice(0, 600);
  const keyPoints = (bullets.length ? bullets : sents.slice(3, 9)).slice(0, 6).map((s) => s.slice(0, 200));
  const actionSource = [...bullets, ...sents].filter((s) => ACTION.test(s));
  const seen = new Set<string>();
  const actionItems: DocumentAnalysis['actionItems'] = [];
  const deadlines: DocumentAnalysis['deadlines'] = [];
  for (const s of actionSource) {
    const key = s.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    const w = parseWhen(s, now);
    const date = w.date && isDateKey(w.date) && /\d|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december/i.test(s) ? w.date : undefined;
    actionItems.push({ title: s.replace(/\s+/g, ' ').slice(0, 160), dueDate: date });
    if (actionItems.length >= 12) break;
  }
  for (const s of sents) {
    if (!/\b(deadline|due|by|before|no later than|until)\b/i.test(s)) continue;
    const w = parseWhen(s, now);
    if (w.date && /\d|january|february|march|april|may|june|july|august|september|october|november|december/i.test(s)) deadlines.push({ what: s.slice(0, 160), date: w.date });
    if (deadlines.length >= 8) break;
  }
  return { summary, keyPoints, actionItems, deadlines };
}
