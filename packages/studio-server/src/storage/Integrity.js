import { createHash } from 'node:crypto';
//
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? 'null' : stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function withIntegrity(payload) {
  return { ...payload, integrity: { algorithm: 'sha256', digest: sha256(stableJson(payload)) } };
}

export function verifyIntegrity(payload) {
  if (!payload || typeof payload !== 'object' || !payload.integrity) return { present: false, valid: true };
  const { integrity, ...content } = payload;
  if (integrity.algorithm !== 'sha256' || typeof integrity.digest !== 'string') return { present: true, valid: false };
  return { present: true, valid: sha256(stableJson(content)) === integrity.digest };
}
