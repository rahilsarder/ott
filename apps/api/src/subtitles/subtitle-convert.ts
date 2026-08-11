/**
 * SRT/ASS/SSA/VTT → WebVTT, with encoding detection.
 *
 * Pure and framework-free on purpose: the conversion logic is the part worth
 * unit-testing in isolation, and it has no reason to know about Nest, Prisma
 * or HTTP.
 */

const TIMESTAMP_COMMA = /(\d{2}:\d{2}:\d{2}),(\d{3})/g;

export type SubtitleFormat = 'srt' | 'ass' | 'vtt';

/**
 * Windows-1252 and Latin-1 are identical below 0xA0 but diverge in 0x80-0x9F —
 * exactly where curly quotes, em dashes and ellipses live, all common in
 * subtitle dialogue. Node's `TextDecoder('windows-1252')` resolves to a plain
 * Latin-1 passthrough rather than the real codepage, so that range is mapped
 * by hand instead of trusted to the runtime.
 */
const CP1252_HIGH: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

function decodeWindows1252(buffer: Buffer): string {
  let out = '';
  for (const byte of buffer) {
    out += String.fromCodePoint(byte >= 0x80 && byte <= 0x9f ? (CP1252_HIGH[byte] ?? byte) : byte);
  }
  return out;
}

/**
 * Subtitle exports are rarely UTF-8 in the wild — Windows tools default to the
 * system codepage. BOM sniffing catches the well-behaved cases; a strict UTF-8
 * decode catches the common ones; Windows-1252 is the fallback most legacy
 * Latin-script exports actually use. Non-Latin scripts (Bengali, Malayalam, …)
 * need a real UTF-8 export — there is no reliable heuristic for legacy
 * single-byte encodings of those, so we surface a clear error instead of
 * silently mangling the text.
 */
export function decodeSubtitleBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf-8');
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return decodeWindows1252(buffer);
  }
}

export function detectFormat(filename: string, text: string): SubtitleFormat {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'vtt') return 'vtt';
  if (ext === 'ass' || ext === 'ssa') return 'ass';
  if (ext === 'srt') return 'srt';

  const head = text.slice(0, 200);
  if (/^\uFEFF?WEBVTT/.test(head)) return 'vtt';
  if (/\[Script Info\]/i.test(head)) return 'ass';
  return 'srt';
}

/** Throws a plain Error with a message safe to show an admin directly. */
export function convertSubtitleToVtt(buffer: Buffer, filename: string): string {
  const text = decodeSubtitleBuffer(buffer).replace(/\r\n?/g, '\n');
  const format = detectFormat(filename, text);
  const vtt = format === 'vtt' ? normalizeVtt(text) : format === 'ass' ? assToVtt(text) : srtToVtt(text);

  if (!vtt.includes('-->')) {
    throw new Error('No subtitle cues found — check the file is a valid SRT, ASS/SSA or WebVTT export.');
  }
  return vtt;
}

function srtToVtt(text: string): string {
  const blocks = text.trim().split(/\n{2,}/);
  const cues: string[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    // An SRT block usually opens with a bare sequence number; WebVTT has no
    // equivalent and does not need one.
    const start = /^\d+$/.test(lines[0]?.trim() ?? '') ? 1 : 0;
    const timing = lines[start];
    if (!timing?.includes('-->')) continue;

    const vttTiming = timing.replace(TIMESTAMP_COMMA, '$1.$2');
    const body = lines.slice(start + 1);
    cues.push([vttTiming, ...body].join('\n'));
  }

  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function assToVtt(text: string): string {
  const lines = text.split('\n');
  const eventsAt = lines.findIndex((l) => /^\[Events]/i.test(l.trim()));
  if (eventsAt === -1) return 'WEBVTT\n';

  let fields: string[] = [];
  const cues: string[] = [];

  for (let i = eventsAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\[/.test(line.trim())) break;

    if (/^Format:/i.test(line)) {
      fields = line
        .slice(line.indexOf(':') + 1)
        .split(',')
        .map((f) => f.trim().toLowerCase());
      continue;
    }
    if (!/^Dialogue:/i.test(line) || fields.length === 0) continue;

    const startCol = fields.indexOf('start');
    const endCol = fields.indexOf('end');
    const textCol = fields.indexOf('text');
    if (startCol === -1 || endCol === -1 || textCol === -1) continue;

    // The Text field is the last one in the format and may itself contain
    // commas, so everything from textCol onward is rejoined rather than split.
    const values = line.slice(line.indexOf(':') + 1).split(',');
    const start = assTimeToVtt(values[startCol]?.trim());
    const end = assTimeToVtt(values[endCol]?.trim());
    if (!start || !end) continue;

    const raw = values.slice(textCol).join(',');
    const cleanText = raw
      .replace(/\{[^}]*\}/g, '') // override tags — {\an8}, {\pos(...)}, …
      .replace(/\\N/gi, '\n')
      .trim();
    if (!cleanText) continue;

    cues.push(`${start} --> ${end}\n${cleanText}`);
  }

  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

function assTimeToVtt(raw?: string): string | null {
  const match = raw?.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
  if (!match) return null;
  const [, h, mm, ss, centis] = match;
  return `${h.padStart(2, '0')}:${mm}:${ss}.${centis}0`;
}

function normalizeVtt(text: string): string {
  let body = text.replace(/^\uFEFF/, '').trim();
  if (!/^WEBVTT/.test(body)) body = `WEBVTT\n\n${body}`;
  return `${body.replace(TIMESTAMP_COMMA, '$1.$2')}\n`;
}
