import { describe, expect, it } from 'vitest';
import { generateDeviceCode, generateUserCode } from '../src/devices/device-code.util';
import { hashOpaqueToken } from '../src/common/crypto.util';

describe('generateUserCode', () => {
  it('produces an 8-character code from the unambiguous alphabet', () => {
    const code = generateUserCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
  });

  it('never contains ambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateUserCode()).not.toMatch(/[0O1IL]/);
    }
  });

  it('is not deterministic', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateUserCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('generateDeviceCode', () => {
  it('produces a long, url-safe token', () => {
    const code = generateDeviceCode();
    expect(code.length).toBeGreaterThan(30);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is not deterministic', () => {
    expect(generateDeviceCode()).not.toBe(generateDeviceCode());
  });
});

describe('hashOpaqueToken', () => {
  it('is deterministic', () => {
    expect(hashOpaqueToken('same-input')).toBe(hashOpaqueToken('same-input'));
  });

  it('differs for different inputs', () => {
    expect(hashOpaqueToken('a')).not.toBe(hashOpaqueToken('b'));
  });

  it('does not return the raw input', () => {
    expect(hashOpaqueToken('secret')).not.toBe('secret');
  });
});
