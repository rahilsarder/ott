import { describe, expect, it } from 'vitest';
import { convertSubtitleToVtt, decodeSubtitleBuffer, detectFormat } from '../src/subtitles/subtitle-convert';

describe('subtitle-convert — SRT', () => {
  const srt = [
    '1',
    '00:00:01,000 --> 00:00:04,500',
    'Hello there.',
    '',
    '2',
    '00:00:05,200 --> 00:00:07,000',
    'Second line one',
    'Second line two',
    '',
  ].join('\n');

  it('converts timestamps and drops the index line', () => {
    const vtt = convertSubtitleToVtt(Buffer.from(srt, 'utf-8'), 'movie.srt');
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.500');
    expect(vtt).toContain('00:00:05.200 --> 00:00:07.000');
    expect(vtt).not.toMatch(/^1$/m);
    expect(vtt).toContain('Second line one\nSecond line two');
  });

  it('throws a readable error when nothing looks like a cue', () => {
    expect(() => convertSubtitleToVtt(Buffer.from('just some text', 'utf-8'), 'notes.srt')).toThrow(/No subtitle cues/);
  });
});

describe('subtitle-convert — ASS/SSA', () => {
  const ass = [
    '[Script Info]',
    'Title: Example',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.50,0:00:04.00,Default,,0,0,0,,Hello, world!',
    'Dialogue: 0,0:00:05.00,0:00:06.20,Default,,0,0,0,,{\\an8}Line one\\NLine two',
  ].join('\n');

  it('extracts dialogue lines, strips override tags, and honours \\N as a break', () => {
    const vtt = convertSubtitleToVtt(Buffer.from(ass, 'utf-8'), 'show.ass');
    expect(vtt).toContain('00:00:01.500 --> 00:00:04.000');
    // The Text field itself contains a comma; the converter must not split on it.
    expect(vtt).toContain('Hello, world!');
    expect(vtt).toContain('Line one\nLine two');
    expect(vtt).not.toContain('{\\an8}');
  });
});

describe('subtitle-convert — WebVTT passthrough', () => {
  it('normalises a comma-separated VTT and adds a header if missing', () => {
    const input = '00:00:01,000 --> 00:00:02,000\nHi\n';
    const vtt = convertSubtitleToVtt(Buffer.from(input, 'utf-8'), 'already.vtt');
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.000');
  });
});

describe('subtitle-convert — format detection', () => {
  it('prefers the file extension over content sniffing', () => {
    expect(detectFormat('a.srt', 'WEBVTT\n')).toBe('srt');
    expect(detectFormat('a.vtt', '')).toBe('vtt');
    expect(detectFormat('a.ass', '')).toBe('ass');
  });

  it('falls back to content sniffing for an unknown extension', () => {
    expect(detectFormat('a.txt', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi')).toBe('vtt');
    expect(detectFormat('a.txt', '[Script Info]\nTitle: x')).toBe('ass');
    expect(detectFormat('a.txt', '1\n00:00:01,000 --> 00:00:02,000\nHi')).toBe('srt');
  });
});

describe('subtitle-convert — encoding detection', () => {
  it('strips a UTF-8 BOM', () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('WEBVTT', 'utf-8')]);
    expect(decodeSubtitleBuffer(withBom)).toBe('WEBVTT');
  });

  it('decodes valid UTF-8, including non-Latin scripts', () => {
    const bengali = 'হ্যালো';
    expect(decodeSubtitleBuffer(Buffer.from(bengali, 'utf-8'))).toBe(bengali);
  });

  it('falls back to windows-1252 for bytes that are not valid UTF-8', () => {
    // 0x92 is a right single quote in windows-1252 and is not valid standalone UTF-8.
    const cp1252 = Buffer.from([0x44, 0x6f, 0x6e, 0x92, 0x74]); // "Don\x92t"
    expect(decodeSubtitleBuffer(cp1252)).toBe('Don’t');
  });
});
