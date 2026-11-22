const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAX_ENTRY_BYTES = Number.MAX_SAFE_INTEGER;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_PREFIX = 'arc-attachment://';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();
//
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function safeZip64Number(value, label) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`This ARC archive has an unsupported ${label}.`);
  return Number(value);
}

function readZip64Values(view, start, length, fields) {
  let cursor = start;
  const end = start + length;
  while (cursor + 4 <= end) {
    const id = view.getUint16(cursor, true);
    const size = view.getUint16(cursor + 2, true);
    cursor += 4;
    if (cursor + size > end) throw new TypeError('This ARC archive has a damaged ZIP64 entry.');
    if (id === 0x0001) {
      let valueOffset = cursor;
      const result = {};
      for (const field of fields) {
        if (!field.required) continue;
        if (valueOffset + 8 > cursor + size) throw new TypeError('This ARC archive has an incomplete ZIP64 entry.');
        result[field.name] = view.getBigUint64(valueOffset, true);
        valueOffset += 8;
      }
      return result;
    }
    cursor += size;
  }
  return null;
}

function safePath(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 240
    && !name.startsWith('/') && !name.includes('\\') && !name.includes('\0') && !name.includes(':')
    && name.split('/').every((part) => part && part !== '.' && part !== '..');
}

function base64ToBytes(value, maxBytes = MAX_ENTRY_BYTES, oversizedMessage = 'The encoded data exceeds the supported size limit.') {
  if (typeof value !== 'string' || value.length % 4 !== 0) throw new TypeError('An embedded attachment has invalid base64 data.');
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const dataLength = value.length - padding;
  if (padding === 2 && dataLength % 4 !== 2 || padding === 1 && dataLength % 4 !== 3) throw new TypeError('An embedded attachment has invalid base64 data.');
  const decodedLength = value.length / 4 * 3 - padding;
  if (decodedLength > maxBytes) throw new RangeError(oversizedMessage);
  for (let index = 0; index < dataLength; index += 1) {
    const code = value.charCodeAt(index);
    const valid = code >= 65 && code <= 90 || code >= 97 && code <= 122 || code >= 48 && code <= 57 || code === 43 || code === 47;
    if (!valid) throw new TypeError('An embedded attachment has invalid base64 data.');
  }
  for (let index = dataLength; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 61) throw new TypeError('An embedded attachment has invalid base64 data.');
  }
  let binary;
  try { binary = atob(value); }
  catch { throw new TypeError('An embedded attachment has invalid base64 data.'); }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let start = 0; start < bytes.length; start += chunkSize) binary += String.fromCharCode(...bytes.subarray(start, start + chunkSize));
  return btoa(binary);
}

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('This platform does not provide secure archive integrity checks.');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function attachmentMime(value) {
  const match = /^data:([a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*);base64,/i.exec(value);
  if (!match) throw new TypeError('This archive contains an invalid attachment media type.');
  return match[1].toLowerCase();
}

function validateAttachmentBytes(mime, bytes) {
  const ascii = (offset, count) => String.fromCharCode(...bytes.subarray(offset, offset + count));
  const valid = mime === 'application/octet-stream'
    || mime === 'image/png' && bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
    || mime === 'image/gif' && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))
    || mime === 'image/jpeg' && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    || mime === 'image/webp' && bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP'
    || mime === 'image/avif' && bytes.length >= 12 && ascii(4, 4) === 'ftyp' && /^(?:avif|avis)$/.test(ascii(8, 4))
    || !mime.startsWith('image/') || !['image/png', 'image/gif', 'image/jpeg', 'image/webp', 'image/avif'].includes(mime);
  if (!valid) throw new TypeError('An embedded image does not match its declared media type.');
}

export function validateArcAttachmentBytes(mime, bytes) {
  const normalizedMime = String(mime || '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(normalizedMime)) throw new TypeError('This file has an invalid media type.');
  if (!(bytes instanceof Uint8Array) || !bytes.length) throw new TypeError('An embedded attachment cannot be empty.');
  validateAttachmentBytes(normalizedMime, bytes);
  return normalizedMime;
}

export function validateArcAttachments(value, maxTotalBytes = 50 * 1024 * 1024) {
  let totalBytes = 0;
  const visit = (item, depth = 0) => {
    if (depth > 40) throw new RangeError('This file contains data nested too deeply.');
    if (Array.isArray(item)) { for (const entry of item) visit(entry, depth + 1); return; }
    if (!item || typeof item !== 'object') return;
    for (const [key, entry] of Object.entries(item)) {
      if (typeof entry === 'string' && entry.startsWith('data:')) {
        if (!['data', 'preview'].includes(key)) throw new TypeError('This file contains an invalid embedded attachment.');
        const mime = attachmentMime(entry);
        const encoded = entry.slice(entry.indexOf(',') + 1);
        const bytes = base64ToBytes(encoded, MAX_ATTACHMENT_BYTES, 'An embedded attachment exceeds the 20 MiB limit.');
        validateArcAttachmentBytes(mime, bytes);
        if (!bytes.length) throw new TypeError('An embedded attachment cannot be empty.');
        if (bytes.length > MAX_ATTACHMENT_BYTES) throw new RangeError('An embedded attachment exceeds the 20 MiB limit.');
        totalBytes += bytes.length;
        if (totalBytes > maxTotalBytes) throw new RangeError(`Embedded attachments exceed the ${Math.floor(maxTotalBytes / (1024 * 1024))} MiB import limit.`);
      } else if (entry && typeof entry === 'object') visit(entry, depth + 1);
    }
  };
  visit(value);
  return totalBytes;
}

function collectAttachments(value, entries, locations, depth = 0) {
  if (depth > 40) throw new RangeError('This archive contains data nested too deeply.');
  if (Array.isArray(value)) return value.map((item, index) => collectAttachments(item, entries, locations, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (['data', 'preview'].includes(key) && typeof item === 'string' && item.startsWith('data:')) {
      const mime = attachmentMime(item);
      const bytes = base64ToBytes(item.slice(item.indexOf(',') + 1), MAX_ATTACHMENT_BYTES, 'An embedded attachment exceeds the 20 MiB limit.');
      validateAttachmentBytes(mime, bytes);
      if (!bytes.length) throw new TypeError('An embedded attachment cannot be empty.');
      if (bytes.length > MAX_ATTACHMENT_BYTES) throw new RangeError('An embedded attachment exceeds the 20 MiB limit.');
      const name = `attachments/${String(entries.length).padStart(6, '0')}.bin`;
      entries.push({ name, bytes });
      locations.push({ name, mime });
      result[key] = `${ATTACHMENT_PREFIX}${name}?mime=${encodeURIComponent(mime)}`;
    } else result[key] = collectAttachments(item, entries, locations, depth + 1);
  }
  return result;
}

function restoreAttachments(value, files, depth = 0) {
  if (depth > 40) throw new RangeError('This archive contains data nested too deeply.');
  if (Array.isArray(value)) return value.map((item) => restoreAttachments(item, files, depth + 1));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && value.startsWith(ATTACHMENT_PREFIX)) {
      const [name, query = ''] = value.slice(ATTACHMENT_PREFIX.length).split('?');
      if (!safePath(name) || !name.startsWith('attachments/')) throw new TypeError('This archive contains an invalid attachment reference.');
      const mime = new URLSearchParams(query).get('mime') || '';
      if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(mime)) throw new TypeError('This archive contains an invalid attachment media type.');
      const bytes = files.get(name);
      if (!bytes) throw new TypeError('This archive is missing an attachment.');
      return `data:${mime};base64,${bytesToBase64(bytes)}`;
    }
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restoreAttachments(item, files, depth + 1)]));
}

export async function createArcArchive(payload) {
  if (!payload || typeof payload !== 'object' || !['arc-graph', 'arc-project', 'arc-project-encrypted'].includes(payload.format)) throw new TypeError('Unsupported ARC archive content.');
  const encryptedProject = payload.format === 'arc-project-encrypted';
  if (encryptedProject && (payload.version !== 3 || typeof payload.data !== 'string')) throw new TypeError('This encrypted project envelope is not supported.');
  if (!encryptedProject) validateArcAttachments(payload, payload.format === 'arc-graph' ? 50 * 1024 * 1024 : Number.MAX_SAFE_INTEGER);
  const contentType = payload.format === 'arc-project-encrypted' ? 'arc-project' : payload.format;
  const entries = [];
  const locations = [];
  let encryptedPayload = null;
  let packagedPayload;
  if (encryptedProject) {
    const encryptedBytes = base64ToBytes(payload.data, MAX_ENTRY_BYTES, 'The encrypted project payload is too large.');
    if (!encryptedBytes.length) throw new RangeError('The encrypted project payload is empty.');
    const { data, ...metadata } = payload;
    encryptedPayload = { name: 'encrypted.bin', sha256: await sha256Hex(encryptedBytes) };
    entries.push({ name: encryptedPayload.name, bytes: encryptedBytes });
    packagedPayload = { ...metadata, format: 'arc-project-encrypted-archive', dataPath: encryptedPayload.name };
  } else packagedPayload = collectAttachments(payload, entries, locations);
  for (const attachment of locations) attachment.sha256 = await sha256Hex(entries.find((entry) => entry.name === attachment.name).bytes);
  entries.unshift({ name: 'manifest.json', bytes: encoder.encode(JSON.stringify({ format: 'arc-archive', version: 1, contentType, attachments: locations, ...(encryptedPayload ? { encryptedPayload } : {}) })) });
  entries.push({ name: 'content.json', bytes: encoder.encode(JSON.stringify(packagedPayload)) });
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    if (!safePath(entry.name) || entry.bytes.length > MAX_ENTRY_BYTES) throw new RangeError('An ARC archive entry is invalid or too large.');
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.bytes.length, true);
    localView.setUint32(22, entry.bytes.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, entry.bytes);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.bytes.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length + entry.bytes.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  const total = localOffset + centralSize + end.length;
  if (!Number.isSafeInteger(total)) throw new RangeError('This ARC archive is too large to represent in memory.');
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of [...localParts, ...centralParts, end]) { output.set(part, offset); offset += part.length; }
  return output;
}

export async function readArcArchive(input, expectedContentType = '') {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 22) throw new RangeError('This ARC archive is invalid or truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = -1;
  for (let offset = Math.max(0, bytes.length - 65557); offset <= bytes.length - 22; offset += 1) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) endOffset = offset;
  }
  if (endOffset < 0) throw new TypeError('This file is not a supported ARC archive.');
  const disk = view.getUint16(endOffset + 4, true);
  const directoryDisk = view.getUint16(endOffset + 6, true);
  const entriesOnDisk32 = view.getUint16(endOffset + 8, true);
  const count32 = view.getUint16(endOffset + 10, true);
  const centralSize32 = view.getUint32(endOffset + 12, true);
  const centralOffset32 = view.getUint32(endOffset + 16, true);
  let count = count32;
  let centralSize = centralSize32;
  let centralOffset = centralOffset32;
  let directoryEnd = endOffset;
  const zip64 = count32 === 0xffff || entriesOnDisk32 === 0xffff || centralSize32 === 0xffffffff || centralOffset32 === 0xffffffff;
  if (zip64) {
    const locatorOffset = endOffset - 20;
    if (locatorOffset < 0 || view.getUint32(locatorOffset, true) !== 0x07064b50
      || view.getUint32(locatorOffset + 4, true) !== 0 || view.getUint32(locatorOffset + 16, true) !== 1) {
      throw new TypeError('This ARC archive has an invalid ZIP64 directory locator.');
    }
    const zip64EndOffset = safeZip64Number(view.getBigUint64(locatorOffset + 8, true), 'ZIP64 directory offset');
    if (zip64EndOffset + 56 !== locatorOffset || view.getUint32(zip64EndOffset, true) !== 0x06064b50
      || view.getBigUint64(zip64EndOffset + 4, true) < 44n || view.getUint32(zip64EndOffset + 16, true) !== 0
      || view.getUint32(zip64EndOffset + 20, true) !== 0) throw new TypeError('This ARC archive has an invalid ZIP64 directory.');
    const entriesOnDisk = safeZip64Number(view.getBigUint64(zip64EndOffset + 24, true), 'entry count');
    count = safeZip64Number(view.getBigUint64(zip64EndOffset + 32, true), 'entry count');
    centralSize = safeZip64Number(view.getBigUint64(zip64EndOffset + 40, true), 'directory size');
    centralOffset = safeZip64Number(view.getBigUint64(zip64EndOffset + 48, true), 'directory offset');
    directoryEnd = zip64EndOffset;
    if (entriesOnDisk !== count) throw new TypeError('This ARC archive has an invalid ZIP64 entry count.');
  } else if (entriesOnDisk32 !== count32) throw new TypeError('This ARC archive has an invalid entry count.');
  if (!count || count > 4096 || disk !== 0 || directoryDisk !== 0 || centralOffset + centralSize !== directoryEnd) {
    throw new TypeError('This ARC archive has an invalid directory.');
  }
  const files = new Map();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw new TypeError('This ARC archive has a damaged directory.');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize32 = view.getUint32(cursor + 20, true);
    const uncompressedSize32 = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset32 = view.getUint32(cursor + 42, true);
    if (cursor + 46 + nameLength + extraLength + commentLength > centralOffset + centralSize) throw new TypeError('This ARC archive has a damaged directory.');
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const zip64Values = readZip64Values(view, cursor + 46 + nameLength, extraLength, [
      { name: 'uncompressedSize', required: uncompressedSize32 === 0xffffffff },
      { name: 'compressedSize', required: compressedSize32 === 0xffffffff },
      { name: 'localOffset', required: localOffset32 === 0xffffffff }
    ]);
    const uncompressedSize = uncompressedSize32 === 0xffffffff
      ? safeZip64Number(zip64Values?.uncompressedSize ?? -1n, 'entry size') : uncompressedSize32;
    const compressedSize = compressedSize32 === 0xffffffff
      ? safeZip64Number(zip64Values?.compressedSize ?? -1n, 'entry size') : compressedSize32;
    const localOffset = localOffset32 === 0xffffffff
      ? safeZip64Number(zip64Values?.localOffset ?? -1n, 'entry offset') : localOffset32;
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!safePath(name) || files.has(name) || method !== 0 || flags & ~0x0808 || compressedSize !== uncompressedSize) throw new TypeError('This ARC archive contains an unsupported or unsafe entry.');
    if (localOffset + 30 > centralOffset || view.getUint32(localOffset, true) !== 0x04034b50) throw new TypeError('This ARC archive has a damaged file entry.');
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localCrc = view.getUint32(localOffset + 14, true);
    const localCompressedSize = view.getUint32(localOffset + 18, true);
    const localUncompressedSize = view.getUint32(localOffset + 22, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localName = decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength));
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const hasDataDescriptor = Boolean(flags & 0x0008);
    if (localName !== name || localFlags !== flags || localMethod !== method
      || !hasDataDescriptor && (localCrc !== crc || localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize)
      || hasDataDescriptor && localCrc !== 0
      || localOffset + 30 + localNameLength + localExtraLength > centralOffset || dataOffset + uncompressedSize > centralOffset) throw new TypeError('This ARC archive has a truncated or inconsistent file entry.');
    const entry = bytes.slice(dataOffset, dataOffset + uncompressedSize);
    if (crc32(entry) !== crc) throw new TypeError(`Archive integrity check failed for ${name}.`);
    if (hasDataDescriptor) {
      let descriptorOffset = dataOffset + uncompressedSize;
      if (descriptorOffset + 4 <= centralOffset && view.getUint32(descriptorOffset, true) === 0x08074b50) descriptorOffset += 4;
      const zip64Descriptor = compressedSize32 === 0xffffffff || uncompressedSize32 === 0xffffffff;
      const descriptorLength = zip64Descriptor ? 20 : 12;
      if (descriptorOffset + descriptorLength > centralOffset || view.getUint32(descriptorOffset, true) !== crc) {
        throw new TypeError(`Archive integrity check failed for ${name}.`);
      }
      const descriptorCompressed = zip64Descriptor
        ? safeZip64Number(view.getBigUint64(descriptorOffset + 4, true), 'entry size')
        : view.getUint32(descriptorOffset + 4, true);
      const descriptorUncompressed = zip64Descriptor
        ? safeZip64Number(view.getBigUint64(descriptorOffset + 12, true), 'entry size')
        : view.getUint32(descriptorOffset + 8, true);
      if (descriptorCompressed !== compressedSize || descriptorUncompressed !== uncompressedSize) {
        throw new TypeError(`Archive integrity check failed for ${name}.`);
      }
    }
    files.set(name, entry);
  }
  if (cursor !== centralOffset + centralSize) throw new TypeError('This ARC archive has a damaged directory size.');
  const manifestBytes = files.get('manifest.json');
  const contentBytes = files.get('content.json');
  if (!manifestBytes || !contentBytes) throw new TypeError('This ARC archive is missing its manifest or content.');
  const manifest = JSON.parse(decoder.decode(manifestBytes));
  const payload = JSON.parse(decoder.decode(contentBytes));
  if (manifest.contentSha256 && (!/^[a-f0-9]{64}$/.test(manifest.contentSha256) || await sha256Hex(contentBytes) !== manifest.contentSha256)) {
    throw new TypeError('This ARC archive content failed its integrity check.');
  }
  const encryptedArchive = payload?.format === 'arc-project-encrypted-archive';
  if (manifest?.format !== 'arc-archive' || manifest.version !== 1 || !['arc-graph', 'arc-project'].includes(manifest.contentType)
    || (payload?.format !== manifest.contentType && !(manifest.contentType === 'arc-project' && encryptedArchive))
    || expectedContentType && manifest.contentType !== expectedContentType) throw new TypeError('This ARC archive contains an unsupported content type.');
  if (encryptedArchive) {
    const encrypted = manifest.encryptedPayload;
    if (!encrypted || encrypted.name !== 'encrypted.bin' || !/^[a-f0-9]{64}$/.test(encrypted.sha256 || '') || !files.has(encrypted.name)
      || await sha256Hex(files.get(encrypted.name)) !== encrypted.sha256 || payload.dataPath !== encrypted.name || payload.version !== 3) throw new TypeError('This encrypted ARC project archive failed its integrity check.');
    payload.format = 'arc-project-encrypted';
    payload.data = bytesToBase64(files.get(encrypted.name));
    delete payload.dataPath;
  } else if (manifest.encryptedPayload) throw new TypeError('This ARC archive contains unexpected encrypted data.');
  const declared = new Set();
  for (const attachment of manifest.attachments || []) {
    if (!safePath(attachment.name) || !attachment.name.startsWith('attachments/') || declared.has(attachment.name) || !files.has(attachment.name)
      || !/^[a-f0-9]{64}$/.test(attachment.sha256 || '') || await sha256Hex(files.get(attachment.name)) !== attachment.sha256) throw new TypeError('This ARC archive has an invalid attachment manifest or integrity check.');
    declared.add(attachment.name);
  }
  for (const name of files.keys()) if (name.startsWith('attachments/') && !declared.has(name)) throw new TypeError('This ARC archive contains an undeclared attachment.');
  for (const name of files.keys()) if (!['manifest.json', 'content.json', manifest.encryptedPayload?.name].includes(name) && !name.startsWith('attachments/')) throw new TypeError('This ARC archive contains an unsupported file.');
  const restored = restoreAttachments(payload, files);
  validateArcAttachments(restored, Number.MAX_SAFE_INTEGER);
  return restored;
}

export function isArcArchive(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return bytes.length >= 4 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) === 0x04034b50;
}
