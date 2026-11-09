import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateArcAttachmentBytes } from '../storage/ArcArchive.js';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PROJECT_BYTES = 100 * 1024 * 1024;
const MAX_ASSETS = 2000;
//
function cleanFilename(value) {
  const name = path.basename(String(value || 'file')).replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/:]/g, '_').trim().slice(0, 120);
  if (!name || name === '.' || name === '..') throw new TypeError('This filename is not allowed.');
  return name;
}

function sniffContentType(bytes, declaredType) {
  const declared = String(declaredType || '').toLowerCase();
  if (declared !== 'application/octet-stream') return declared;
  const ascii = (offset, length) => bytes.subarray(offset, offset + length).toString('ascii');
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (bytes.length >= 12 && ascii(4, 4) === 'ftyp' && /^(?:avif|avis)$/.test(ascii(8, 4))) return 'image/avif';
  if (bytes.length >= 12 && ascii(4, 4) === 'ftyp') return ascii(8, 4) === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video/webm';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'audio/wav';
  if (bytes.length >= 4 && ascii(0, 4) === 'fLaC') return 'audio/flac';
  if ((bytes.length >= 3 && ascii(0, 3) === 'ID3') || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (bytes.length >= 4 && ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'application/zip';
  if (bytes.length >= 5 && ascii(0, 5) === '%PDF-') return 'application/pdf';
  return declared;
}

function contentBytes(asset) {
  if (asset?.bytes instanceof Uint8Array) {
    const bytes = Buffer.from(asset.bytes);
    if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new RangeError('Each project asset must be 20 MiB or smaller.');
    return { bytes, contentType: validateArcAttachmentBytes(sniffContentType(bytes, asset.contentType), bytes) };
  }
  const match = /^data:([a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(String(asset?.data || ''));
  if (!match) throw new TypeError('This file has an invalid media type.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new RangeError('Each project asset must be smaller than 20 MiB.');
  if (Math.ceil(match[2].length / 4) * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0) !== bytes.length) throw new TypeError('This file has invalid base64 data.');
  return { bytes, contentType: validateArcAttachmentBytes(sniffContentType(bytes, match[1]), bytes) };
}

export class ProjectMediaStore {
  constructor(projectDir) {
    this.filePath = path.join(projectDir, 'media-assets.json');
    this.mediaDirectory = path.join(projectDir, 'media');
  }

  list() {
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!Array.isArray(value) || value.length > MAX_ASSETS) throw new Error('The project media library is invalid.');
      let migrated = false;
      let totalBytes = 0;
      const metadata = [];
      for (const asset of value) {
        if (typeof asset.id !== 'string' || !/^media_[0-9a-f-]{36}$/i.test(asset.id)) throw new Error('The project media library metadata is invalid.');
        const legacyData = typeof asset.data === 'string';
        const { bytes, contentType } = legacyData
          ? contentBytes(asset)
          : { bytes: fs.readFileSync(path.join(this.mediaDirectory, `${asset.id}.bin`)), contentType: String(asset.contentType || '').toLowerCase() };
        validateArcAttachmentBytes(contentType, bytes);
        totalBytes += bytes.length;
        const normalizedGenericType = asset.contentType === 'application/octet-stream' && contentType !== 'application/octet-stream';
        if (cleanFilename(asset.filename) !== asset.filename || Number(asset.size) !== bytes.length || asset.contentType !== contentType && !normalizedGenericType) throw new Error('The project media library metadata is invalid.');
        if (typeof asset.id !== 'string' || !/^media_[0-9a-f-]{36}$/i.test(asset.id)
          || crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('The project media library failed its integrity check.');
        if (legacyData) {
          fs.mkdirSync(this.mediaDirectory, { recursive: true, mode: 0o700 });
          fs.writeFileSync(path.join(this.mediaDirectory, `${asset.id}.bin`), bytes, { flag: 'wx', mode: 0o600 });
          migrated = true;
        }
        if (asset.preview) {
          const thumbnail = contentBytes({ filename: 'preview.webp', data: asset.preview });
          if (!/^image\/(?:jpeg|png|webp)$/.test(thumbnail.contentType) || thumbnail.bytes.length > 256 * 1024) throw new Error('The project media thumbnail is invalid.');
          totalBytes += thumbnail.bytes.length;
        }
        if (totalBytes > MAX_PROJECT_BYTES) throw new Error('The project media library exceeds its storage limit.');
        const { data, ...safeMetadata } = asset;
        if (normalizedGenericType) { safeMetadata.contentType = contentType; migrated = true; }
        metadata.push(safeMetadata);
      }
      if (migrated) this.persist(metadata);
      return metadata;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('The project media library could not be read.');
    }
  }

  add(input) {
    if (!input || typeof input !== 'object') throw new TypeError('Choose a file to upload.');
    const { bytes, contentType } = contentBytes(input);
    const filename = cleanFilename(input.filename);
    const imageExtensions = new Map([['.avif', 'image/avif'], ['.gif', 'image/gif'], ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp']]);
    const expectedImageType = imageExtensions.get(path.extname(filename).toLowerCase());
    if (expectedImageType && contentType.startsWith('image/') && expectedImageType !== contentType) throw new TypeError('The image file type does not match its contents.');
    let preview = '';
    if (typeof input.preview === 'string' && input.preview) {
      const previewFile = contentBytes({ data: input.preview, filename: 'preview.webp' });
      if (!/^image\/(?:jpeg|png|webp)$/.test(previewFile.contentType) || previewFile.bytes.length > 256 * 1024) throw new TypeError('The image thumbnail is invalid.');
      preview = input.preview;
    }
    const assets = this.list();
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    const usedBytes = assets.reduce((total, item) => total + (Number(item.size) || 0) + (item.preview ? Buffer.byteLength(item.preview, 'utf8') * 0.75 : 0), 0);
    if (usedBytes + bytes.length + (preview ? Buffer.byteLength(preview, 'utf8') * 0.75 : 0) > MAX_PROJECT_BYTES) throw new RangeError('The project media library is limited to 100 MiB.');
    if (assets.length >= MAX_ASSETS) throw new RangeError('The project media library has reached its file limit.');
    const base = path.parse(filename);
    let uniqueName = filename;
    let suffix = 2;
    while (assets.some((item) => item.filename.toLowerCase() === uniqueName.toLowerCase())) {
      uniqueName = `${base.name} (${suffix++})${base.ext}`;
      if (suffix > 10000) throw new RangeError('Could not create a unique filename.');
    }
    const asset = { id: `media_${crypto.randomUUID()}`, filename: uniqueName, contentType, size: bytes.length, sha256: digest, ...(preview ? { preview } : {}), createdAt: new Date().toISOString() };
    fs.mkdirSync(this.mediaDirectory, { recursive: true, mode: 0o700 });
    const blobPath = path.join(this.mediaDirectory, `${asset.id}.bin`);
    fs.writeFileSync(blobPath, bytes, { flag: 'wx', mode: 0o600 });
    try { this.persist([asset, ...assets]); }
    catch (error) { try { fs.rmSync(blobPath, { force: true }); } catch {} throw error; }
    return asset;
  }

  get(id) {
    const asset = this.list().find((item) => item.id === id);
    if (!asset) return null;
    const bytes = fs.readFileSync(path.join(this.mediaDirectory, `${asset.id}.bin`));
    return { ...asset, data: `data:${asset.contentType};base64,${bytes.toString('base64')}` };
  }

  getBytes(id) {
    const asset = this.list().find((item) => item.id === id);
    if (!asset) return null;
    return { asset, bytes: fs.readFileSync(path.join(this.mediaDirectory, `${asset.id}.bin`)) };
  }

  getAll() {
    return this.list().map((asset) => {
      const bytes = fs.readFileSync(path.join(this.mediaDirectory, `${asset.id}.bin`));
      return { ...asset, data: `data:${asset.contentType};base64,${bytes.toString('base64')}` };
    });
  }

  importAssets(assets = []) {
    if (!Array.isArray(assets)) throw new TypeError('The project media library is invalid.');
    for (const asset of assets) this.add(asset);
  }

  delete(id) {
    const assets = this.list();
    const removed = assets.find((asset) => asset.id === id);
    if (!removed) return false;
    for (const name of ['graphs.json', 'embeds.json', 'graph-library.json']) {
      try {
        const value = JSON.parse(fs.readFileSync(path.join(path.dirname(this.filePath), name), 'utf8'));
        const referencesAsset = (item, depth = 0) => {
          if (!item || typeof item !== 'object' || depth > 40) return false;
          if ((item.assetId === id || item.id === id) && item.filename === removed.filename) return true;
          return Object.values(item).some((child) => referencesAsset(child, depth + 1));
        };
        if (referencesAsset(value)) throw new Error('Remove this file from graphs and saved components before deleting it from project media.');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    this.persist(assets.filter((asset) => asset.id !== id));
    try { fs.rmSync(path.join(this.mediaDirectory, `${removed.id}.bin`), { force: true }); } catch {}
    return true;
  }

  persist(assets) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(assets), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporaryPath, this.filePath);
      try { fs.chmodSync(this.filePath, 0o600); } catch {}
    } finally {
      try { fs.rmSync(temporaryPath, { force: true }); } catch {}
    }
  }
}
