import crypto from 'node:crypto';
import { deflateSync } from 'node:zlib';

const SIZE = 96;
const CACHE_LIMIT = 512;
const COLORS = ['#63b3ed', '#f687b3', '#68d391', '#f6ad55', '#b794f4', '#4fd1c5', '#fc8181', '#90cdf4', '#fbd38d', '#9ae6b4'];
const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100']
};
const cache = new Map();
//
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function avatarColor(userId) {
  let hash = 0;
  for (const character of String(userId || '')) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  const color = COLORS[(hash >>> 0) % COLORS.length];
  return color.slice(1).match(/.{2}/g).map((part) => Number.parseInt(part, 16));
}

function avatarSignature(userId, initial, secret) {
  return crypto.createHmac('sha256', secret).update(`arc-activity-avatar-v1:${userId}:${initial}`).digest('base64url');
}

export function verifyActivityAvatarSignature(userId, initial, signature, secret) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(userId || ''))
    || !/^[A-Z0-9?]$/.test(String(initial || ''))
    || !/^[A-Za-z0-9_-]{43}$/.test(String(signature || ''))
    || typeof secret !== 'string'
    || !secret) return false;
  const expected = Buffer.from(avatarSignature(userId, initial, secret));
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function makeAvatar(initial, rgb) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const center = (SIZE - 1) / 2;
  const radiusSquared = 45 ** 2;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if ((x - center) ** 2 + (y - center) ** 2 > radiusSquared) continue;
      const offset = (y * SIZE + x) * 4;
      pixels[offset] = rgb[0];
      pixels[offset + 1] = rgb[1];
      pixels[offset + 2] = rgb[2];
      pixels[offset + 3] = 255;
    }
  }

  const glyph = GLYPHS[initial] || GLYPHS['?'];
  const scale = 9;
  const left = Math.floor((SIZE - 5 * scale) / 2);
  const top = Math.floor((SIZE - 7 * scale) / 2);
  for (let row = 0; row < glyph.length; row += 1) {
    for (let column = 0; column < glyph[row].length; column += 1) {
      if (glyph[row][column] !== '1') continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const x = left + column * scale + dx;
          const y = top + row * scale + dy;
          const offset = (y * SIZE + x) * 4;
          pixels[offset] = 255;
          pixels[offset + 1] = 255;
          pixels[offset + 2] = 255;
          pixels[offset + 3] = 255;
        }
      }
    }
  }

  const scanlines = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) pixels.copy(scanlines, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

export function renderActivityAvatarPng(userId, initial = 'U') {
  const id = String(userId || '').slice(0, 128);
  const glyph = Array.from(String(initial || 'U').trim())[0]?.toLocaleUpperCase() || 'U';
  const key = `${id}:${glyph}`;
  if (cache.has(key)) {
    const cached = cache.get(key);
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const image = makeAvatar(glyph, avatarColor(id));
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, image);
  return image;
}

export function activityAvatarUrl(req, actor, secret) {
  const id = String(actor?.id || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || typeof secret !== 'string' || !secret) return '';
  const forwardedHost = String(req.get?.('x-forwarded-host') || '').split(',')[0].trim();
  const requestHost = String(req.get?.('host') || '').split(',')[0].trim();
  let origin;
  try {
    const requestOrigin = new URL(String(req.get?.('origin') || ''));
    if (requestOrigin.protocol !== 'https:' || requestOrigin.username || requestOrigin.password
      || requestOrigin.pathname !== '/' || requestOrigin.search || requestOrigin.hash
      || ![forwardedHost, requestHost].some((host) => host && host.toLowerCase() === requestOrigin.host.toLowerCase())) return '';
    origin = requestOrigin.origin;
  } catch { return ''; }
  const initial = Array.from(String(actor?.username || '').trim())[0]?.toLocaleUpperCase() || 'U';
  const glyph = /^[A-Z0-9?]$/.test(initial) ? initial : '?';
  const url = new URL(`/api/activity-avatars/${encodeURIComponent(id)}.png`, origin);
  url.searchParams.set('initial', glyph);
  url.searchParams.set('signature', avatarSignature(id, glyph, secret));
  return url.href;
}
