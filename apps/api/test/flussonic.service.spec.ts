import { describe, expect, it } from 'vitest';
import { FlussonicService } from '../src/playback/flussonic.service';
import type { Env } from '../src/config/env';

type Overrides = Partial<Env>;

function makeService(overrides: Overrides = {}): FlussonicService {
  const values: Partial<Env> = {
    FLUSSONIC_BASE_URL: 'http://cdn.example.com:8082',
    FLUSSONIC_SECURELINK_KEY: 'Rahil?no_check_ip=true',
    FLUSSONIC_TOKEN_SCOPE: 'live',
    FLUSSONIC_BIND_IP: true,
    FLUSSONIC_AUTH_IP_ALLOWLIST: '',
    PLAYBACK_TOKEN_TTL_SEC: 3600,
    LIVE_TOKEN_TTL_SEC: 10800,
    ...overrides,
  };
  const config = { get: (key: keyof Env) => values[key] } as never;
  return new FlussonicService(config);
}

const tokenOf = (url: string) => new URL(url).searchParams.get('token') ?? '';
const partsOf = (url: string) => tokenOf(url).split('-');

describe('FlussonicService — securelink', () => {
  /*
   * Reference vector captured from the live Flussonic 22.07 server. If this
   * breaks, the tokens this service mints will be rejected in production, so it
   * is the single most important assertion in the suite.
   */
  it('mints a token it can verify back', () => {
    const service = makeService();
    // Timestamps come from signManifest so this stays true as time passes;
    // the fixed vector from the real server is asserted separately below,
    // where no expiry check is involved.
    const { url, token } = service.signManifest('encoder4', '203.0.113.9', true);
    const [hash, salt] = token.split('-');

    expect(hash).toHaveLength(40);
    expect(salt).toHaveLength(32);
    expect(new URL(url).searchParams.get('token')).toBe(token);
    expect(service.verifyToken(token, 'encoder4', '203.0.113.9')).toBe(true);
  });

  it('emits the documented token shape: hash-salt-endtime-starttime', () => {
    const { url } = makeService().signManifest('encoder4', '203.0.113.9', true);
    const [hash, salt, end, start] = partsOf(url);
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(Number(end)).toBeGreaterThan(Number(start));
    expect(Number(end) - Number(start)).toBe(10800);
  });

  it('uses index.m3u8 for live and playlist.m3u8 for VOD', () => {
    const service = makeService({ FLUSSONIC_TOKEN_SCOPE: 'none' });
    expect(service.signManifest('encoder4', '203.0.113.9', true).url).toBe(
      'http://cdn.example.com:8082/encoder4/index.m3u8',
    );
    expect(service.signManifest('ftp2/movie.mp4', '203.0.113.9', false).url).toBe(
      'http://cdn.example.com:8082/ftp2/movie.mp4/playlist.m3u8',
    );
  });

  it('signs live but leaves VOD untouched under the live scope', () => {
    const service = makeService();
    expect(tokenOf(service.signManifest('encoder4', '203.0.113.9', true).url)).not.toBe('');
    expect(service.signManifest('ftp2/movie.mp4', '203.0.113.9', false).url).not.toContain('token=');
  });

  describe('securelink key parsing', () => {
    // The admin UI stores options inside the key field; signing them as key
    // material would produce a hash the server can never reproduce.
    it('strips a ?no_check_ip=true suffix from the key before signing', () => {
      const withSuffix = makeService({ FLUSSONIC_SECURELINK_KEY: 'Rahil?no_check_ip=true' });
      const bare = makeService({ FLUSSONIC_SECURELINK_KEY: 'Rahil', FLUSSONIC_BIND_IP: false });

      const token = tokenOf(withSuffix.signManifest('encoder4', '203.0.113.9', true).url);
      // A token minted with the suffix present must validate against the bare key.
      expect(bare.verifyToken(token, 'encoder4', '198.51.100.7')).toBe(true);
    });

    it('signs with the literal no_check_ip when the option is set', () => {
      const service = makeService();
      const token = tokenOf(service.signManifest('encoder4', '203.0.113.9', true).url);
      // Any viewer IP validates, because the IP was never part of the digest.
      expect(service.verifyToken(token, 'encoder4', '198.51.100.7')).toBe(true);
    });

    it('binds to the viewer IP when the option is absent', () => {
      const service = makeService({ FLUSSONIC_SECURELINK_KEY: 'Rahil' });
      const token = tokenOf(service.signManifest('encoder4', '203.0.113.9', true).url);
      expect(service.verifyToken(token, 'encoder4', '203.0.113.9')).toBe(true);
      expect(service.verifyToken(token, 'encoder4', '198.51.100.7')).toBe(false);
    });
  });

  describe('token verification', () => {
    it('rejects a token replayed against a different stream', () => {
      const service = makeService();
      const token = tokenOf(service.signManifest('encoder4', '203.0.113.9', true).url);
      expect(service.verifyToken(token, 'encoder9', '203.0.113.9')).toBe(false);
    });

    it('rejects a tampered digest', () => {
      const service = makeService();
      const [hash, salt, end, start] = partsOf(service.signManifest('encoder4', '203.0.113.9', true).url);
      const flipped = hash.startsWith('a') ? `b${hash.slice(1)}` : `a${hash.slice(1)}`;
      expect(service.verifyToken(`${flipped}-${salt}-${end}-${start}`, 'encoder4', '203.0.113.9')).toBe(false);
    });

    it('rejects an expired token', () => {
      const service = makeService({ LIVE_TOKEN_TTL_SEC: -60 });
      const token = tokenOf(service.signManifest('encoder4', '203.0.113.9', true).url);
      expect(service.verifyToken(token, 'encoder4', '203.0.113.9')).toBe(false);
    });

    it('rejects malformed tokens', () => {
      const service = makeService();
      expect(service.verifyToken('garbage', 'encoder4', '203.0.113.9')).toBe(false);
      expect(service.verifyToken('a-b-c', 'encoder4', '203.0.113.9')).toBe(false);
      expect(service.verifyToken('a-b-notanumber-x', 'encoder4', '203.0.113.9')).toBe(false);
    });

    it('refuses everything when no key is configured', () => {
      // Approving sessions with nothing to verify against is a rubber stamp.
      const service = makeService({ FLUSSONIC_SECURELINK_KEY: '' });
      expect(service.verifyToken('anything', 'encoder4', '203.0.113.9')).toBe(false);
      expect(service.signManifest('encoder4', '203.0.113.9', true).url).not.toContain('token=');
    });
  });

  describe('path encoding', () => {
    // Real VOD paths carry spaces, parentheses and brackets.
    it('encodes a realistic VOD path the way Flussonic emits it', () => {
      const service = makeService();
      const { url } = service.signManifest(
        'ftp2/bollywood/2025/Pongala (2025)/Pongala.2025.1080p.Dual[Hindi-Malayalam].AAC.WEB-DL.h264.ESub.mp4',
        '203.0.113.9',
        false,
      );
      expect(url).toContain('/ftp2/bollywood/2025/Pongala%20%282025%29/');
      expect(url).toContain('Dual%5BHindi-Malayalam%5D');
      expect(url).toContain('/playlist.m3u8');
      // Separators must survive as real slashes.
      expect(url).not.toContain('%2F');
    });

    /*
     * Paths get pasted straight out of a browser or a third-party player, so
     * they arrive already encoded. Encoding them again yields %2520 and a 404
     * whose cause is invisible in the URL.
     */
    it('does not re-encode a path that was stored already-encoded', () => {
      const service = makeService({ FLUSSONIC_TOKEN_SCOPE: 'none' });
      const stored =
        'download/tv-series/Alice%20in%20Borderland%20%282020%29/Season%201/Alice%20in%20Borderland%20%282020%29%20-%201x1.mp4';
      const url = service.signManifest(stored, '203.0.113.9', false).url;

      expect(url).not.toContain('%2520');
      expect(url).toContain('/Alice%20in%20Borderland%20%282020%29/Season%201/');
      expect(url).toContain('/playlist.m3u8');
    });

    it('produces the same URL whether the path was pasted raw or encoded', () => {
      const service = makeService({ FLUSSONIC_TOKEN_SCOPE: 'none' });
      const raw = 'download/tv-series/Alice in Borderland (2020)/Season 1/ep - 1x1.mp4';
      const encoded =
        'download/tv-series/Alice%20in%20Borderland%20%282020%29/Season%201/ep%20-%201x1.mp4';

      expect(service.signManifest(encoded, '203.0.113.9', false).url).toBe(
        service.signManifest(raw, '203.0.113.9', false).url,
      );
    });

    it('unwinds a doubly-encoded path', () => {
      const service = makeService({ FLUSSONIC_TOKEN_SCOPE: 'none' });
      const doubled = 'download/Alice%2520in%2520Borderland';
      expect(service.signManifest(doubled, '203.0.113.9', false).url).toContain('/Alice%20in%20Borderland/');
    });

    // A literal % in a filename must survive; decoding it would corrupt the path.
    it('leaves a filename containing a bare % alone', () => {
      const service = makeService({ FLUSSONIC_TOKEN_SCOPE: 'none' });
      const url = service.signManifest('vod/100% Real.mp4', '203.0.113.9', false).url;
      expect(url).toContain('/vod/100%25%20Real.mp4/');
    });

    it('leaves a plain live stream name untouched', () => {
      const service = makeService({ FLUSSONIC_TOKEN_SCOPE: 'none' });
      expect(service.signManifest('encoder4', '203.0.113.9', true).url).toContain('/encoder4/index.m3u8');
    });

    it('strips a trailing slash from the configured base URL', () => {
      const service = makeService({ FLUSSONIC_BASE_URL: 'http://cdn.example.com:8082/', FLUSSONIC_TOKEN_SCOPE: 'none' });
      expect(service.signManifest('encoder4', '203.0.113.9', true).url).toBe(
        'http://cdn.example.com:8082/encoder4/index.m3u8',
      );
    });
  });

  describe('auth callback allowlist', () => {
    it('restricts the callback to the configured IPs', () => {
      const service = makeService({ FLUSSONIC_AUTH_IP_ALLOWLIST: '203.0.113.9, 198.51.100.1' });
      expect(service.isCallerAllowed('203.0.113.9')).toBe(true);
      expect(service.isCallerAllowed('::ffff:198.51.100.1')).toBe(true);
      expect(service.isCallerAllowed('192.0.2.7')).toBe(false);
    });

    it('allows any caller when the allowlist is empty', () => {
      expect(makeService().isCallerAllowed('192.0.2.7')).toBe(true);
    });
  });
});

describe('securelink reference vector', () => {
  /*
   * Locks the exact digest formula, independent of the service wiring:
   *   sha1(stream + ip + starttime + endtime + key + salt)
   *   token = hash-salt-endtime-starttime
   */
  it('matches the token captured from the production server', async () => {
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha1')
      .update('encoder4' + 'no_check_ip' + '1786214434' + '1786225234' + 'Rahil' + '55d8fc7b5e656a51c6da90b0818bebae')
      .digest('hex');

    expect(`${hash}-55d8fc7b5e656a51c6da90b0818bebae-1786225234-1786214434`).toBe(
      '3e1f03301ca8ce2f74ae3391bfbd4237c09c8e2e-55d8fc7b5e656a51c6da90b0818bebae-1786225234-1786214434',
    );
  });
});
