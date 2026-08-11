export interface ParsedProgramme {
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Minimal XMLTV reader for the `<programme start stop>` elements of a single
 * channel. Deliberately regex-based rather than a full XML parser: the payload
 * is admin-supplied, the grammar used by EPG providers is narrow, and this
 * avoids pulling an XML dependency (and its entity-expansion surface) into the
 * API for one endpoint.
 */
export function parseXmltv(xml: string, channelFilter?: string): ParsedProgramme[] {
  const programmes: ParsedProgramme[] = [];
  const blockRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;

  for (const match of xml.matchAll(blockRe)) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';

    const start = attr(attrs, 'start');
    const stop = attr(attrs, 'stop');
    const channel = attr(attrs, 'channel');
    if (!start || !stop) continue;
    if (channelFilter && channel && channel !== channelFilter) continue;

    const startsAt = parseXmltvDate(start);
    const endsAt = parseXmltvDate(stop);
    if (!startsAt || !endsAt || endsAt <= startsAt) continue;

    programmes.push({
      title: decodeEntities(tag(body, 'title')) || 'Untitled',
      description: decodeEntities(tag(body, 'desc')),
      startsAt,
      endsAt,
    });
  }

  return programmes.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function attr(attrs: string, name: string): string | null {
  return new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs)?.[1] ?? null;
}

function tag(body: string, name: string): string {
  const raw = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(body)?.[1] ?? '';
  return raw.replace(/<[^>]+>/g, '').trim();
}

/** XMLTV timestamps look like `20240115203000 +0100` (offset optional). */
export function parseXmltvDate(value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?$/.exec(value.trim());
  if (!m) return null;

  const [, y, mo, d, h, mi, s, offset] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s ?? '00'}${offset ? `${offset.slice(0, 3)}:${offset.slice(3)}` : 'Z'}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
