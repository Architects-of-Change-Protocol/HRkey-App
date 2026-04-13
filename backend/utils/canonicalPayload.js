import crypto from 'node:crypto';

function canonicalizeValue(value) {
  if (value === null) return 'null';

  const type = typeof value;
  if (type === 'number' || type === 'boolean') {
    return JSON.stringify(value);
  }

  if (type === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeValue(item)).join(',')}]`;
  }

  if (type === 'object') {
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalizeValue(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(null);
}

/**
 * Canonical JSON serialization for stable hashing/signatures.
 * Objects are recursively key-sorted; arrays preserve original order.
 */
export function canonicalizeForHash(payload) {
  return canonicalizeValue(payload);
}

export function hashCanonicalPayload(payload) {
  return crypto.createHash('sha256').update(canonicalizeForHash(payload)).digest('hex');
}

export default {
  canonicalizeForHash,
  hashCanonicalPayload
};
