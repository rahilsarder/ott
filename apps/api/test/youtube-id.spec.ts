import { describe, expect, it } from 'vitest';
import { extractYoutubeId, youtubeIdSchema } from '@ott/shared';

describe('extractYoutubeId', () => {
  it('passes a bare id through unchanged', () => {
    expect(extractYoutubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('reads the v= param off a watch URL', () => {
    expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toBe('dQw4w9WgXcQ');
  });

  it('reads the id off a youtu.be short link', () => {
    expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('reads the id off an embed or shorts URL', () => {
    expect(extractYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYoutubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('returns the input unchanged when nothing recognisable is found, leaving validation to the schema', () => {
    expect(extractYoutubeId('not a url at all')).toBe('not a url at all');
    expect(extractYoutubeId('https://vimeo.com/12345')).toBe('https://vimeo.com/12345');
  });
});

describe('youtubeIdSchema', () => {
  it('accepts a pasted watch URL and stores only the id', () => {
    const result = youtubeIdSchema.safeParse('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('dQw4w9WgXcQ');
  });

  it('rejects a non-YouTube URL and other garbage', () => {
    expect(youtubeIdSchema.safeParse('https://vimeo.com/12345').success).toBe(false);
    expect(youtubeIdSchema.safeParse('not-eleven-chars').success).toBe(false);
  });
});
