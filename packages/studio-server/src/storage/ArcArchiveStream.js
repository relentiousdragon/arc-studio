import fs from 'node:fs';
import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { Readable } from 'node:stream';
import { validateArcAttachmentBytes } from './ArcArchive.js';

const ATTACHMENT_PREFIX = 'arc-attachment://';
const MAX_INLINE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const PROJECT_EXPORT_KDF = Object.freeze({ N: 131072, r: 8, p: 1 });
const PROJECT_EXPORT_AAD = 'arc-studio-encrypted-project-v1';
const ZIP32_MAX = 0xffffffff;

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
function updateCrc32(crc, bytes) {
  let value = crc;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

function safePath(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 240
    && !name.startsWith('/') && !name.includes('\\') && !name.includes('\0') && !name.includes(':')
    && name.split('/').every((part) => part && part !== '.' && part !== '..');
}

function decodeInlineAttachment(value) {
  const match = /^data:([a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(value);
  if (!match || match[2].length % 4 !== 0) throw new TypeError('This project contains an invalid embedded attachment.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_INLINE_ATTACHMENT_BYTES
    || bytes.toString('base64') !== match[2]) throw new RangeError('An embedded attachment exceeds the 20 MiB limit or has invalid base64 data.');
  const mime = validateArcAttachmentBytes(match[1], bytes);
  return { mime, bytes };
}

async function* sourceChunks(source) {
  if (Buffer.isBuffer(source.bytes)) {
    const chunkSize = 1024 * 1024;
    for (let start = 0; start < source.bytes.length; start += chunkSize) {
      yield source.bytes.subarray(start, Math.min(start + chunkSize, source.bytes.length));
    }
    return;
  }
  if (source.path) {
    yield* fs.createReadStream(source.path, { highWaterMark: 1024 * 1024 });
    return;
  }
  if (source.iterable && typeof source.iterable[Symbol.asyncIterator] === 'function') {
    yield* source.iterable;
    return;
  }
  throw new TypeError('An ARC archive entry has no readable source.');
}

async function hashSource(source) {
  const hash = createHash('sha256');
  let size = 0n;
  for await (const chunk of sourceChunks(source)) {
    size += BigInt(chunk.length);
    hash.update(chunk);
  }
  return { size, sha256: hash.digest('hex') };
}

function addAttachmentRef(name, mime, source, entries, locations) {
  if (!safePath(name) || !name.startsWith('attachments/')) throw new TypeError('This project contains an invalid attachment reference.');
  if (entries.some((entry) => entry.name === name)) throw new TypeError('This project contains duplicate attachment names.');
  entries.push({ name, source, expectedSha256: source.expectedSha256 || '' });
  locations.push({ name, mime, source });
  return `${ATTACHMENT_PREFIX}${name}?mime=${encodeURIComponent(mime)}`;
}

function collectArchiveAttachments(value, sourceFiles, entries, locations, depth = 0, key = '') {
  if (depth > 40) throw new RangeError('This project contains data nested too deeply.');
  if (Array.isArray(value)) return value.map((item) => collectArchiveAttachments(item, sourceFiles, entries, locations, depth + 1, key));
  if (!value || typeof value !== 'object') {
    if (['data', 'preview'].includes(key) && typeof value === 'string' && value.startsWith('data:')) {
      const { mime, bytes } = decodeInlineAttachment(value);
      const name = `attachments/${String(entries.length).padStart(6, '0')}.bin`;
      return addAttachmentRef(name, mime, { bytes }, entries, locations);
    }
    if (key === 'data' && typeof value === 'string' && value.startsWith(ATTACHMENT_PREFIX)) {
      const [name, query = ''] = value.slice(ATTACHMENT_PREFIX.length).split('?');
      const source = sourceFiles.get(name);
      const mime = new URLSearchParams(query).get('mime') || '';
      if (!source || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(mime)) {
        throw new TypeError('This project contains an invalid media attachment reference.');
      }
      return addAttachmentRef(name, mime, source, entries, locations);
    }
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [
    childKey,
    collectArchiveAttachments(item, sourceFiles, entries, locations, depth + 1, childKey)
  ]));
}

async function prepareAttachments(locations) {
  const manifest = [];
  for (const location of locations) {
    const sha256 = location.source.expectedSha256 || (await hashSource(location.source)).sha256;
    location.source.expectedSha256 = sha256;
    manifest.push({ name: location.name, mime: location.mime, sha256 });
  }
  return manifest;
}

function writeZip64Extra(values) {
  const extra = Buffer.alloc(4 + values.length * 8);
  extra.writeUInt16LE(0x0001, 0);
  extra.writeUInt16LE(values.length * 8, 2);
  values.forEach((value, index) => extra.writeBigUInt64LE(value, 4 + index * 8));
  return extra;
}

function localHeader(nameBytes) {
  const extra = writeZip64Extra([0n, 0n]);
  const header = Buffer.alloc(30 + nameBytes.length + extra.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(45, 4);
  header.writeUInt16LE(0x0808, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(ZIP32_MAX, 18);
  header.writeUInt32LE(ZIP32_MAX, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(extra.length, 28);
  nameBytes.copy(header, 30);
  extra.copy(header, 30 + nameBytes.length);
  return header;
}

async function* zipEntryChunks(entry, offset) {
  const nameBytes = Buffer.from(entry.name, 'utf8');
  if (!safePath(entry.name) || nameBytes.length > 0xffff) throw new TypeError('An ARC archive entry has an invalid name.');
  yield localHeader(nameBytes);

  const hash = createHash('sha256');
  let size = 0n;
  let crc = 0xffffffff;
  for await (const chunk of sourceChunks(entry.source)) {
    size += BigInt(chunk.length);
    hash.update(chunk);
    crc = updateCrc32(crc, chunk);
    yield chunk;
  }
  const sha256 = hash.digest('hex');
  const crc32 = (crc ^ 0xffffffff) >>> 0;
  if (entry.expectedSha256 && sha256 !== entry.expectedSha256) throw new Error(`Project media changed during export: ${entry.name}.`);

  const descriptor = Buffer.alloc(24);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc32, 4);
  descriptor.writeBigUInt64LE(size, 8);
  descriptor.writeBigUInt64LE(size, 16);
  yield descriptor;

  const zip64Extra = writeZip64Extra([size, size, offset]);
  const central = Buffer.alloc(46 + nameBytes.length + zip64Extra.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE((3 << 8) | 45, 4);
  central.writeUInt16LE(45, 6);
  central.writeUInt16LE(0x0808, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt32LE(crc32, 16);
  central.writeUInt32LE(ZIP32_MAX, 20);
  central.writeUInt32LE(ZIP32_MAX, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt16LE(zip64Extra.length, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(ZIP32_MAX, 42);
  nameBytes.copy(central, 46);
  zip64Extra.copy(central, 46 + nameBytes.length);
  return { central, size, crc32, sha256 };
}

async function* emitZipEntry(entry, offset) {
  const iterator = zipEntryChunks(entry, offset)[Symbol.asyncIterator]();
  let meta;
  while (true) {
    const result = await iterator.next();
    if (result.done) { meta = result.value; break; }
    yield result.value;
  }
  return meta;
}

async function* zipChunks(entries) {
  let offset = 0n;
  const centralEntries = [];
  for (const entry of entries) {
    const iterator = emitZipEntry(entry, offset)[Symbol.asyncIterator]();
    let meta;
    while (true) {
      const result = await iterator.next();
      if (result.done) { meta = result.value; break; }
      offset += BigInt(result.value.length);
      yield result.value;
    }
    centralEntries.push(meta.central);
  }
  const centralOffset = offset;
  let centralSize = 0n;
  for (const entry of centralEntries) centralSize += BigInt(entry.length);
  for (const entry of centralEntries) { offset += BigInt(entry.length); yield entry; }

  const zip64Offset = offset;
  const zip64End = Buffer.alloc(56);
  zip64End.writeUInt32LE(0x06064b50, 0);
  zip64End.writeBigUInt64LE(44n, 4);
  zip64End.writeUInt16LE((3 << 8) | 45, 12);
  zip64End.writeUInt16LE(45, 14);
  zip64End.writeUInt32LE(0, 16);
  zip64End.writeUInt32LE(0, 20);
  zip64End.writeBigUInt64LE(BigInt(centralEntries.length), 24);
  zip64End.writeBigUInt64LE(BigInt(centralEntries.length), 32);
  zip64End.writeBigUInt64LE(centralSize, 40);
  zip64End.writeBigUInt64LE(centralOffset, 48);
  yield zip64End;

  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeUInt32LE(0, 4);
  locator.writeBigUInt64LE(zip64Offset, 8);
  locator.writeUInt32LE(1, 16);
  yield locator;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(0xffff, 8);
  end.writeUInt16LE(0xffff, 10);
  end.writeUInt32LE(ZIP32_MAX, 12);
  end.writeUInt32LE(ZIP32_MAX, 16);
  end.writeUInt16LE(0, 20);
  yield end;
}

function archivePayload(payload, sourceFiles) {
  if (!payload || typeof payload !== 'object' || !['arc-graph', 'arc-project'].includes(payload.format)) {
    throw new TypeError('Unsupported ARC archive content.');
  }
  const entries = [];
  const locations = [];
  const packagedPayload = collectArchiveAttachments(payload, sourceFiles, entries, locations);
  return { entries, locations, packagedPayload };
}

export async function createArcArchiveStream(payload, sourceFiles = new Map()) {
  const { entries: attachments, locations, packagedPayload } = archivePayload(payload, sourceFiles);
  const manifestAttachments = await prepareAttachments(locations);
  const contentBytes = Buffer.from(JSON.stringify(packagedPayload));
  const manifest = {
    format: 'arc-archive', version: 1, contentType: payload.format, attachments: manifestAttachments,
    contentSha256: createHash('sha256').update(contentBytes).digest('hex')
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const zipEntries = [
    { name: 'manifest.json', source: { bytes: manifestBytes } },
    { name: 'content.json', source: { bytes: contentBytes } },
    ...attachments
  ];
  return Readable.from(zipChunks(zipEntries), { objectMode: false });
}

function normalizePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw new TypeError('Use an export password between 12 and 1,024 characters.');
  }
  return password;
}

export async function createEncryptedArcProjectArchiveStream(payload, sourceFiles = new Map(), password) {
  normalizePassword(password);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32, { ...PROJECT_EXPORT_KDF, maxmem: 256 * 1024 * 1024 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(PROJECT_EXPORT_AAD));
  const encryption = { tag: '' };
  const innerStream = await createArcArchiveStream(payload, sourceFiles);
  async function* encryptedContent() {
    for await (const chunk of innerStream) {
      const encrypted = cipher.update(chunk);
      if (encrypted.length) yield encrypted;
    }
    const final = cipher.final();
    if (final.length) yield final;
    encryption.tag = cipher.getAuthTag().toString('base64');
  }

  async function* outerArchive() {
    const centralEntries = [];
    let offset = 0n;
    const encryptedIterator = emitZipEntry({ name: 'encrypted.bin', source: { iterable: encryptedContent() } }, offset)[Symbol.asyncIterator]();
    let encryptedMeta;
    while (true) {
      const result = await encryptedIterator.next();
      if (result.done) { encryptedMeta = result.value; break; }
      offset += BigInt(result.value.length);
      yield result.value;
    }
    centralEntries.push(encryptedMeta.central);

    const contentBytes = Buffer.from(JSON.stringify({
      format: 'arc-project-encrypted-archive', version: 3, cipher: 'aes-256-gcm', kdf: 'scrypt',
      ...PROJECT_EXPORT_KDF, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: encryption.tag, dataPath: 'encrypted.bin'
    }));
    const manifestBytes = Buffer.from(JSON.stringify({
      format: 'arc-archive', version: 1, contentType: 'arc-project', attachments: [],
      encryptedPayload: { name: 'encrypted.bin', sha256: encryptedMeta.sha256 },
      contentSha256: createHash('sha256').update(contentBytes).digest('hex')
    }));
    for (const entry of [
      { name: 'manifest.json', source: { bytes: manifestBytes } },
      { name: 'content.json', source: { bytes: contentBytes } }
    ]) {
      const iterator = emitZipEntry(entry, offset)[Symbol.asyncIterator]();
      let meta;
      while (true) {
        const result = await iterator.next();
        if (result.done) { meta = result.value; break; }
        offset += BigInt(result.value.length);
        yield result.value;
      }
      centralEntries.push(meta.central);
    }

    const centralOffset = offset;
    let centralSize = 0n;
    for (const entry of centralEntries) centralSize += BigInt(entry.length);
    for (const entry of centralEntries) { offset += BigInt(entry.length); yield entry; }
    const zip64Offset = offset;
    const zip64End = Buffer.alloc(56);
    zip64End.writeUInt32LE(0x06064b50, 0);
    zip64End.writeBigUInt64LE(44n, 4);
    zip64End.writeUInt16LE((3 << 8) | 45, 12);
    zip64End.writeUInt16LE(45, 14);
    zip64End.writeUInt32LE(0, 16);
    zip64End.writeUInt32LE(0, 20);
    zip64End.writeBigUInt64LE(BigInt(centralEntries.length), 24);
    zip64End.writeBigUInt64LE(BigInt(centralEntries.length), 32);
    zip64End.writeBigUInt64LE(centralSize, 40);
    zip64End.writeBigUInt64LE(centralOffset, 48);
    yield zip64End;
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeUInt32LE(0, 4);
    locator.writeBigUInt64LE(zip64Offset, 8);
    locator.writeUInt32LE(1, 16);
    yield locator;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(0xffff, 8);
    end.writeUInt16LE(0xffff, 10);
    end.writeUInt32LE(ZIP32_MAX, 12);
    end.writeUInt32LE(ZIP32_MAX, 16);
    end.writeUInt16LE(0, 20);
    yield end;
  }

  return Readable.from(outerArchive(), { objectMode: false });
}
