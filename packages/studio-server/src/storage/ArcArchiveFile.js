import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createDecipheriv, createHash, scryptSync } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { validateArcAttachmentBytes } from './ArcArchive.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
const ATTACHMENT_PREFIX = 'arc-attachment://';
const MAX_DIRECTORY_BYTES = 64 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const PROJECT_EXPORT_KDF = Object.freeze({ N: 131072, r: 8, p: 1 });
const PROJECT_EXPORT_AAD = 'arc-studio-encrypted-project-v1';
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();
//
function safeNumber(value, label) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`The project archive ${label} is too large to process.`);
  return Number(value);
}

function safePath(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 240
    && !name.startsWith('/') && !name.includes('\\') && !name.includes('\0') && !name.includes(':')
    && name.split('/').every((part) => part && part !== '.' && part !== '..');
}

async function readAt(handle, position, length, signal) {
  if (!Number.isSafeInteger(position) || position < 0 || !Number.isSafeInteger(length) || length < 0) throw new TypeError('The project archive contains an invalid range.');
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    if (signal?.aborted) throw signal.reason || new Error('Project import cancelled.');
    const { bytesRead } = await handle.read(buffer, offset, Math.min(length - offset, 8 * 1024 * 1024), position + offset);
    if (!bytesRead) throw new TypeError('The project archive is truncated.');
    offset += bytesRead;
  }
  return buffer;
}

function readZip64Extra(extra, required) {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = extra.readUInt16LE(cursor);
    const length = extra.readUInt16LE(cursor + 2);
    cursor += 4;
    if (cursor + length > extra.length) throw new TypeError('The project archive has a damaged ZIP64 entry.');
    if (id === 0x0001) {
      const values = [];
      let valueOffset = cursor;
      for (let index = 0; index < required; index += 1) {
        if (valueOffset + 8 > cursor + length) throw new TypeError('The project archive has an incomplete ZIP64 entry.');
        values.push(extra.readBigUInt64LE(valueOffset));
        valueOffset += 8;
      }
      return values;
    }
    cursor += length;
  }
  return null;
}

async function readZipDirectory(archivePath, signal) {
  const handle = await fs.promises.open(archivePath, 'r');
  try {
    if (signal?.aborted) throw signal.reason || new Error('Project import cancelled.');
    const { size: fileSize } = await handle.stat();
    if (fileSize < 22) throw new TypeError('This is not a supported ARC project archive.');
    const tailLength = Math.min(fileSize, 65557);
    const tailStart = fileSize - tailLength;
    const tail = await readAt(handle, tailStart, tailLength, signal);
    let eocdInTail = -1;
    for (let offset = Math.max(0, tail.length - 65557); offset <= tail.length - 22; offset += 1) {
      if (tail.readUInt32LE(offset) === 0x06054b50 && offset + 22 + tail.readUInt16LE(offset + 20) === tail.length) eocdInTail = offset;
    }
    if (eocdInTail < 0) throw new TypeError('This is not a supported ARC project archive.');
    const eocdOffset = tailStart + eocdInTail;
    const disk = tail.readUInt16LE(eocdInTail + 4);
    const directoryDisk = tail.readUInt16LE(eocdInTail + 6);
    const entriesOnDisk32 = tail.readUInt16LE(eocdInTail + 8);
    const count32 = tail.readUInt16LE(eocdInTail + 10);
    const centralSize32 = tail.readUInt32LE(eocdInTail + 12);
    const centralOffset32 = tail.readUInt32LE(eocdInTail + 16);
    let count = count32;
    let centralSize = centralSize32;
    let centralOffset = centralOffset32;
    let directoryEnd = eocdOffset;
    const zip64 = count32 === 0xffff || entriesOnDisk32 === 0xffff || centralSize32 === 0xffffffff || centralOffset32 === 0xffffffff;
    if (zip64) {
      if (eocdOffset < 20) throw new TypeError('The project archive has an invalid ZIP64 locator.');
      const locator = await readAt(handle, eocdOffset - 20, 20, signal);
      if (locator.readUInt32LE(0) !== 0x07064b50 || locator.readUInt32LE(4) !== 0 || locator.readUInt32LE(16) !== 1) {
        throw new TypeError('The project archive has an invalid ZIP64 locator.');
      }
      const zip64Offset = safeNumber(locator.readBigUInt64LE(8), 'directory offset');
      const zip64End = await readAt(handle, zip64Offset, 56, signal);
      if (zip64End.readUInt32LE(0) !== 0x06064b50 || zip64End.readBigUInt64LE(4) < 44n
        || zip64End.readUInt32LE(16) !== 0 || zip64End.readUInt32LE(20) !== 0 || zip64Offset + 56 !== eocdOffset - 20) {
        throw new TypeError('The project archive has an invalid ZIP64 directory.');
      }
      const entriesOnDisk = safeNumber(zip64End.readBigUInt64LE(24), 'entry count');
      count = safeNumber(zip64End.readBigUInt64LE(32), 'entry count');
      centralSize = safeNumber(zip64End.readBigUInt64LE(40), 'directory size');
      centralOffset = safeNumber(zip64End.readBigUInt64LE(48), 'directory offset');
      directoryEnd = zip64Offset;
      if (entriesOnDisk !== count) throw new TypeError('The project archive has an invalid ZIP64 entry count.');
    } else if (entriesOnDisk32 !== count32) throw new TypeError('The project archive has an invalid entry count.');
    if (disk || directoryDisk || !count || count > 4096 || centralSize > MAX_DIRECTORY_BYTES || centralOffset + centralSize !== directoryEnd) {
      throw new TypeError('The project archive has an invalid directory.');
    }

    const centralBytes = await readAt(handle, centralOffset, centralSize, signal);
    const entries = new Map();
    let cursor = 0;
    for (let index = 0; index < count; index += 1) {
      if (cursor + 46 > centralBytes.length || centralBytes.readUInt32LE(cursor) !== 0x02014b50) throw new TypeError('The project archive has a damaged directory.');
      const flags = centralBytes.readUInt16LE(cursor + 8);
      const method = centralBytes.readUInt16LE(cursor + 10);
      const crc32 = centralBytes.readUInt32LE(cursor + 16);
      const compressed32 = centralBytes.readUInt32LE(cursor + 20);
      const uncompressed32 = centralBytes.readUInt32LE(cursor + 24);
      const nameLength = centralBytes.readUInt16LE(cursor + 28);
      const extraLength = centralBytes.readUInt16LE(cursor + 30);
      const commentLength = centralBytes.readUInt16LE(cursor + 32);
      const localOffset32 = centralBytes.readUInt32LE(cursor + 42);
      if (cursor + 46 + nameLength + extraLength + commentLength > centralBytes.length) throw new TypeError('The project archive has a damaged directory entry.');
      const name = decoder.decode(centralBytes.subarray(cursor + 46, cursor + 46 + nameLength));
      const extra = centralBytes.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength);
      const required = [uncompressed32 === 0xffffffff, compressed32 === 0xffffffff, localOffset32 === 0xffffffff].filter(Boolean).length;
      const zip64Values = required ? readZip64Extra(extra, required) : [];
      if (required && !zip64Values) throw new TypeError('The project archive is missing ZIP64 values.');
      let zip64Index = 0;
      const uncompressedSize = uncompressed32 === 0xffffffff ? safeNumber(zip64Values[zip64Index++], 'entry size') : uncompressed32;
      const compressedSize = compressed32 === 0xffffffff ? safeNumber(zip64Values[zip64Index++], 'entry size') : compressed32;
      const localOffset = localOffset32 === 0xffffffff ? safeNumber(zip64Values[zip64Index], 'entry offset') : localOffset32;
      cursor += 46 + nameLength + extraLength + commentLength;
      if (!safePath(name) || entries.has(name) || method !== 0 || flags & ~0x0808 || compressedSize !== uncompressedSize
        || localOffset + 30 > centralOffset) throw new TypeError('The project archive contains an unsupported or unsafe entry.');
      const local = await readAt(handle, localOffset, 30, signal);
      if (local.readUInt32LE(0) !== 0x04034b50) throw new TypeError('The project archive has a damaged file entry.');
      const localFlags = local.readUInt16LE(6);
      const localMethod = local.readUInt16LE(8);
      const localCrc = local.readUInt32LE(14);
      const localCompressed = local.readUInt32LE(18);
      const localUncompressed = local.readUInt32LE(22);
      const localNameLength = local.readUInt16LE(26);
      const localExtraLength = local.readUInt16LE(28);
      const localName = decoder.decode(await readAt(handle, localOffset + 30, localNameLength, signal));
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const hasDescriptor = Boolean(flags & 0x0008);
      if (localName !== name || localFlags !== flags || localMethod !== method
        || !hasDescriptor && (localCrc !== crc32 || localCompressed !== compressedSize || localUncompressed !== uncompressedSize)
        || hasDescriptor && localCrc !== 0 || dataOffset + uncompressedSize > centralOffset) {
        throw new TypeError('The project archive has a truncated or inconsistent file entry.');
      }
      if (hasDescriptor) {
        let descriptorOffset = dataOffset + uncompressedSize;
        const signature = await readAt(handle, descriptorOffset, 4, signal);
        if (signature.readUInt32LE(0) === 0x08074b50) descriptorOffset += 4;
        const zip64Descriptor = compressed32 === 0xffffffff || uncompressed32 === 0xffffffff;
        const descriptor = await readAt(handle, descriptorOffset, zip64Descriptor ? 20 : 12, signal);
        const descriptorCrc = descriptor.readUInt32LE(0);
        const descriptorCompressed = zip64Descriptor ? safeNumber(descriptor.readBigUInt64LE(4), 'entry size') : descriptor.readUInt32LE(4);
        const descriptorUncompressed = zip64Descriptor ? safeNumber(descriptor.readBigUInt64LE(12), 'entry size') : descriptor.readUInt32LE(8);
        if (descriptorCrc !== crc32 || descriptorCompressed !== compressedSize || descriptorUncompressed !== uncompressedSize) {
          throw new TypeError(`Archive integrity check failed for ${name}.`);
        }
      }
      entries.set(name, { name, crc32, size: uncompressedSize, offset: dataOffset });
    }
    if (cursor !== centralBytes.length) throw new TypeError('The project archive has a damaged directory size.');
    return { fileSize, entries };
  } finally {
    await handle.close();
  }
}

function entryStream(archivePath, entry, signal) {
  if (entry.size === 0) return Readable.from([]);
  const options = { highWaterMark: 1024 * 1024, ...(signal ? { signal } : {}) };
  return fs.createReadStream(archivePath, { ...options, start: entry.offset, end: entry.offset + entry.size - 1 });
}

async function readMetadataEntry(archivePath, entry, label, signal) {
  if (!entry) throw new TypeError(`The project archive is missing its ${label}.`);
  const handle = await fs.promises.open(archivePath, 'r');
  let bytes;
  try { bytes = await readAt(handle, entry.offset, entry.size, signal); }
  finally { await handle.close(); }
  const crc = crc32(bytes);
  if (crc !== entry.crc32) throw new TypeError(`Archive integrity check failed for ${entry.name}.`);
  return bytes;
}

function updateCrc32(crc, bytes) {
  let value = crc;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

function crc32(bytes) {
  return (updateCrc32(0xffffffff, bytes) ^ 0xffffffff) >>> 0;
}

async function verifyEntry(archivePath, entry, expectedSha256 = '', signal) {
  const hash = createHash('sha256');
  let crc = 0xffffffff;
  let size = 0;
  for await (const chunk of entryStream(archivePath, entry, signal)) {
    if (signal?.aborted) throw signal.reason || new Error('Project import cancelled.');
    size += chunk.length;
    hash.update(chunk);
    crc = updateCrc32(crc, chunk);
  }
  const sha256 = hash.digest('hex');
  if (size !== entry.size || ((crc ^ 0xffffffff) >>> 0) !== entry.crc32 || expectedSha256 && sha256 !== expectedSha256) {
    throw new TypeError(`Archive integrity check failed for ${entry.name}.`);
  }
  return sha256;
}

function parseJson(bytes, message) {
  try { return JSON.parse(decoder.decode(bytes)); }
  catch { throw new TypeError(message); }
}

function collectMediaAttachmentNames(payload) {
  const names = new Set();
  for (const asset of payload?.files?.['media-assets.json'] || []) {
    const value = asset?.data;
    if (typeof value !== 'string' || !value.startsWith(ATTACHMENT_PREFIX)) continue;
    const [name] = value.slice(ATTACHMENT_PREFIX.length).split('?');
    names.add(name);
  }
  return names;
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function restoreInlineAttachments(value, archivePath, entries, mediaNames, signal, depth = 0, key = '') {
  if (signal?.aborted) throw signal.reason || new Error('Project import cancelled.');
  if (depth > 40) throw new RangeError('The project archive contains data nested too deeply.');
  if (Array.isArray(value)) {
    const restored = [];
    for (const item of value) restored.push(await restoreInlineAttachments(item, archivePath, entries, mediaNames, signal, depth + 1, key));
    return restored;
  }
  if (!value || typeof value !== 'object') {
    if (!['data', 'preview'].includes(key) || typeof value !== 'string' || !value.startsWith(ATTACHMENT_PREFIX)) return value;
    const [name, query = ''] = value.slice(ATTACHMENT_PREFIX.length).split('?');
    if (mediaNames.has(name)) return value;
    const entry = entries.get(name);
    const mime = new URLSearchParams(query).get('mime') || '';
    if (!entry || entry.size > MAX_ATTACHMENT_BYTES) throw new RangeError('An embedded project attachment exceeds the 20 MiB limit.');
    const bytes = await readMetadataEntry(archivePath, entry, 'attachment', signal);
    const normalizedMime = validateArcAttachmentBytes(mime, bytes);
    return `data:${normalizedMime};base64,${bytesToBase64(bytes)}`;
  }
  const restored = {};
  for (const [childKey, item] of Object.entries(value)) {
    restored[childKey] = await restoreInlineAttachments(item, archivePath, entries, mediaNames, signal, depth + 1, childKey);
  }
  return restored;
}

async function readArcPayload(archivePath, expectedContentType, signal) {
  const { entries } = await readZipDirectory(archivePath, signal);
  const manifestEntry = entries.get('manifest.json');
  const contentEntry = entries.get('content.json');
  if (!manifestEntry || !contentEntry) throw new TypeError('The project archive is missing its manifest or content.');
  const manifestBytes = await readMetadataEntry(archivePath, manifestEntry, 'manifest', signal);
  const contentBytes = await readMetadataEntry(archivePath, contentEntry, 'content', signal);
  const manifest = parseJson(manifestBytes, 'The project archive manifest is invalid.');
  const payload = parseJson(contentBytes, 'The project archive content is invalid.');
  if (signal?.aborted) throw signal.reason || new Error('Project import cancelled.');
  if (manifest.format !== 'arc-archive' || manifest.version !== 1 || !['arc-project', 'arc-graph'].includes(manifest.contentType)
    || expectedContentType && manifest.contentType !== expectedContentType) throw new TypeError('This project archive contains an unsupported content type.');
  const contentSha256 = createHash('sha256').update(contentBytes).digest('hex');
  if (manifest.contentSha256 && manifest.contentSha256 !== contentSha256) throw new TypeError('The project archive content failed its integrity check.');
  const encrypted = payload?.format === 'arc-project-encrypted-archive';
  if (payload?.format !== manifest.contentType && !(manifest.contentType === 'arc-project' && encrypted)) {
    throw new TypeError('This project archive contains an unsupported content type.');
  }
  return { entries, manifest, payload, encrypted, integrityVerified: Boolean(manifest.contentSha256) };
}

function decodeBase64(value, expectedLength, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new TypeError(`The encrypted project ${label} is invalid.`);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== expectedLength || decoded.toString('base64') !== value) throw new TypeError(`The encrypted project ${label} is invalid.`);
  return decoded;
}

async function decryptArchive(archivePath, outer, password, innerPath, signal) {
  const envelope = outer.payload;
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    const error = new TypeError('Use the project export password to continue.');
    error.code = 'PROJECT_PASSWORD_REQUIRED';
    throw error;
  }
  if (envelope.version !== 3 || envelope.cipher !== 'aes-256-gcm' || envelope.kdf !== 'scrypt'
    || envelope.N !== PROJECT_EXPORT_KDF.N || envelope.r !== PROJECT_EXPORT_KDF.r || envelope.p !== PROJECT_EXPORT_KDF.p
    || envelope.dataPath !== 'encrypted.bin') throw new TypeError('This encrypted project format is not supported.');
  const entryName = outer.manifest.encryptedPayload?.name;
  const entry = outer.entries.get(entryName);
  if (!entry || entryName !== 'encrypted.bin' || typeof outer.manifest.encryptedPayload.sha256 !== 'string') {
    throw new TypeError('The encrypted project archive has an invalid ciphertext entry.');
  }
  await verifyEntry(archivePath, entry, outer.manifest.encryptedPayload.sha256, signal);
  const salt = decodeBase64(envelope.salt, 16, 'salt');
  const iv = decodeBase64(envelope.iv, 12, 'IV');
  const tag = decodeBase64(envelope.tag, 16, 'authentication tag');
  const key = scryptSync(password, salt, 32, { ...PROJECT_EXPORT_KDF, maxmem: 256 * 1024 * 1024 });
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(PROJECT_EXPORT_AAD));
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      entryStream(archivePath, entry, signal),
      decipher,
      fs.createWriteStream(innerPath, { flags: 'wx', mode: 0o600 }),
      { signal }
    );
  } catch (cause) {
    try { await fs.promises.rm(innerPath, { force: true }); } catch {}
    if (signal?.aborted) throw signal.reason || new Error('Project import cancelled.');
    if (cause?.name === 'AbortError') throw cause;
    const error = new Error('The password is incorrect or the encrypted project archive is damaged.');
    error.code = 'PROJECT_PASSWORD_INVALID';
    throw error;
  }
  return innerPath;
}

export async function inspectArcProjectArchive(archivePath, { signal } = {}) {
  const archive = await readArcPayload(archivePath, 'arc-project', signal);
  return {
    encrypted: archive.encrypted,
    payload: archive.encrypted ? null : archive.payload,
    integrityVerified: archive.integrityVerified
  };
}

export async function prepareArcProjectImport(archivePath, { password = '', stagingDirectory = path.dirname(archivePath), signal } = {}) {
  let workingPath = archivePath;
  let removeWorkingPath = false;
  try {
    let archive = await readArcPayload(workingPath, 'arc-project', signal);
    if (archive.encrypted) {
      const innerPath = path.join(stagingDirectory, `.arc-inner-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.arcproject`);
      workingPath = await decryptArchive(archivePath, archive, password, innerPath, signal);
      removeWorkingPath = true;
      try { await fs.promises.rm(archivePath, { force: true }); } catch {}
      archive = await readArcPayload(workingPath, 'arc-project', signal);
      if (archive.encrypted) throw new TypeError('The decrypted project archive is invalid.');
    }
    if (archive.payload?.format !== 'arc-project' || archive.payload.version !== 1 || !archive.payload.files || typeof archive.payload.files !== 'object') {
      throw new TypeError('This is not a supported ARC project file.');
    }
    const declared = new Set();
    const mediaNames = collectMediaAttachmentNames(archive.payload);
    const sources = new Map();
    for (const item of archive.manifest.attachments || []) {
      const entry = archive.entries.get(item?.name);
      if (!safePath(item?.name) || !item.name.startsWith('attachments/') || declared.has(item.name) || !entry
        || !/^[a-f0-9]{64}$/.test(item.sha256 || '') || typeof item.mime !== 'string') {
        throw new TypeError('The project archive has an invalid attachment manifest.');
      }
      declared.add(item.name);
      await verifyEntry(workingPath, entry, item.sha256, signal);
      sources.set(item.name, { archivePath: workingPath, offset: entry.offset, size: entry.size, sha256: item.sha256, mime: item.mime });
    }
    for (const name of archive.entries.keys()) {
      if (name.startsWith('attachments/') && !declared.has(name)) throw new TypeError('The project archive contains an undeclared attachment.');
      if (!['manifest.json', 'content.json'].includes(name) && !name.startsWith('attachments/')) throw new TypeError('The project archive contains an unsupported file.');
    }
    for (const name of mediaNames) if (!sources.has(name)) throw new TypeError('The project archive is missing a media file.');
    archive.payload = await restoreInlineAttachments(archive.payload, workingPath, archive.entries, mediaNames, signal);
    return {
      bundle: archive.payload,
      sources,
      archivePath: workingPath,
      integrityVerified: archive.integrityVerified,
      cleanup() {
        if (removeWorkingPath) return fs.promises.rm(workingPath, { force: true });
        return Promise.resolve();
      }
    };
  } catch (error) {
    if (removeWorkingPath) {
      try { await fs.promises.rm(workingPath, { force: true }); } catch {}
    }
    throw error;
  }
}
