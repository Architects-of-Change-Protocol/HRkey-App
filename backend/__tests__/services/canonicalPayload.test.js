import { canonicalizeForHash, hashCanonicalPayload } from '../../utils/canonicalPayload.js';

describe('canonicalPayload', () => {
  test('mismo objeto con distinto orden de keys produce mismo hash', () => {
    const a = { b: 2, a: 1 };
    const b = { a: 1, b: 2 };
    expect(hashCanonicalPayload(a)).toBe(hashCanonicalPayload(b));
  });

  test('nested objects con distinto orden produce mismo hash', () => {
    const a = { z: { b: true, a: null }, n: 1 };
    const b = { n: 1, z: { a: null, b: true } };
    expect(hashCanonicalPayload(a)).toBe(hashCanonicalPayload(b));
  });

  test('arrays mantienen orden', () => {
    expect(hashCanonicalPayload({ v: [1, 2, 3] })).toBe(hashCanonicalPayload({ v: [1, 2, 3] }));
    expect(hashCanonicalPayload({ v: [1, 2, 3] })).not.toBe(hashCanonicalPayload({ v: [3, 2, 1] }));
  });

  test('serialización estable para null/boolean/number', () => {
    expect(canonicalizeForHash({ a: null, b: true, c: 10.5 })).toBe('{"a":null,"b":true,"c":10.5}');
  });
});
