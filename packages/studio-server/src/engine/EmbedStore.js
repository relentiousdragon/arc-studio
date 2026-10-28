import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from '../storage.js';
import { buildDiscordComponentsV2, validateDiscordComponentsV2 } from './nodes/runtime/builders.js';

const embedStorePath = path.join(dataDir, 'embeds.json');
const MAX_EMBEDS = 1000;
const MAX_BLOCKS = 40;
const MAX_ASSET_BYTES = 64_000;
const MAX_COMPONENTS_V2_ASSET_BYTES = 34 * 1024 * 1024;
const MAX_LIBRARY_BYTES = 128 * 1024 * 1024;
const MAX_COMPONENT_ROWS = 5;
//
function normalizeComponents(value) {
  if (!Array.isArray(value)) return [];
  const selectTypes = new Set(['string_select', 'user_select', 'role_select', 'mentionable_select', 'channel_select']);
  return value.slice(0, MAX_COMPONENT_ROWS).map((row) => ({
    id: String(row?.id || crypto.randomUUID()).slice(0, 120),
    components: (Array.isArray(row?.components) ? row.components : []).slice(0, 5).map((component) => {
      if (selectTypes.has(component?.type)) return {
        id: String(component.id || crypto.randomUUID()).slice(0, 120), type: component.type,
        customId: String(component.customId || '').slice(0, 100), placeholder: String(component.placeholder || '').slice(0, 150),
        minValues: Math.max(0, Math.min(25, Number(component.minValues) || 0)), maxValues: Math.max(1, Math.min(25, Number(component.maxValues) || 1)),
        ...(component.type === 'string_select' ? { options: (Array.isArray(component.options) ? component.options : []).slice(0, 25).map((option) => ({
          id: String(option?.id || crypto.randomUUID()).slice(0, 120), label: String(option?.label || '').slice(0, 100),
          value: String(option?.value || '').slice(0, 100), description: String(option?.description || '').slice(0, 100)
        })) } : {}),
        ...(component.type === 'channel_select' && Array.isArray(component.channelTypes) ? { channelTypes: component.channelTypes.slice(0, 8).map(Number).filter(Number.isInteger) } : {})
      };
      const style = ['primary', 'secondary', 'success', 'danger', 'link'].includes(component?.style) ? component.style : 'primary';
      return { id: String(component?.id || crypto.randomUUID()).slice(0, 120), type: 'button', style, label: String(component?.label || '').slice(0, 80), customId: String(component?.customId || '').slice(0, 100), url: String(component?.url || '').slice(0, 512), disabled: Boolean(component?.disabled) };
    })
  }));
}

export class EmbedStore {
  constructor(filePath = embedStorePath) {
    this.filePath = filePath;
    this.embeds = [];
    this.load();
  }

  setFilePath(filePath) {
    this.filePath = filePath;
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.embeds = Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === 'string' && (Array.isArray(item.blocks) || item.kind === 'components-v2' && Array.isArray(item.componentsV2Layout))).slice(0, MAX_EMBEDS) : [];
    } catch {
      this.embeds = [];
    }
  }

  list() {
    return this.embeds.map((embed) => structuredClone(embed));
  }

  save(input, idOverride = null) {
    if (!input || typeof input !== 'object') throw new TypeError('A library asset is required.');
    const isComponentsV2 = input.kind === 'components-v2';
    if (isComponentsV2) {
      if (!Array.isArray(input.componentsV2Layout) || input.componentsV2Layout.length > MAX_BLOCKS) throw new RangeError(`A Components V2 asset can contain at most ${MAX_BLOCKS} top level blocks.`);
      const validationErrors = validateDiscordComponentsV2(buildDiscordComponentsV2(input.componentsV2Layout));
      if (validationErrors.length) throw new TypeError(validationErrors.slice(0, 4).join(' '));
    } else {
      if (!Array.isArray(input.blocks)) throw new TypeError('An embed must include a blocks array.');
      if (input.blocks.length > MAX_BLOCKS) throw new RangeError(`An embed can contain at most ${MAX_BLOCKS} blocks.`);
    }
    const id = String(idOverride || input.id || `embed_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`).slice(0, 100);
    const name = String(input.name || 'Untitled embed').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Untitled embed';
    const asset = isComponentsV2
      ? { id, name, kind: 'components-v2', blocks: [], components: [], componentsV2Layout: structuredClone(input.componentsV2Layout), attachments: Array.isArray(input.attachments) ? structuredClone(input.attachments) : [], updatedAt: new Date().toISOString() }
      : { id, name, blocks: structuredClone(input.blocks), components: normalizeComponents(input.components), updatedAt: new Date().toISOString() };
    const assetBytes = Buffer.byteLength(JSON.stringify(asset), 'utf8');
    if (assetBytes > (isComponentsV2 ? MAX_COMPONENTS_V2_ASSET_BYTES : MAX_ASSET_BYTES)) throw new RangeError(isComponentsV2 ? 'This Components V2 layout and its attachments are too large to save.' : 'This embed is too large to save.');
    const existingIndex = this.embeds.findIndex((embed) => embed.id === id);
    if (existingIndex < 0 && this.embeds.length >= MAX_EMBEDS) throw new RangeError('The shared embed library is full.');
    const nextEmbeds = [...this.embeds];
    if (existingIndex < 0) nextEmbeds.unshift(asset);
    else nextEmbeds[existingIndex] = asset;
    if (Buffer.byteLength(JSON.stringify(nextEmbeds), 'utf8') > MAX_LIBRARY_BYTES) throw new RangeError('The shared asset library has reached its storage limit.');
    if (existingIndex < 0) this.embeds.unshift(asset);
    else this.embeds[existingIndex] = asset;
    this.persist();
    return structuredClone(asset);
  }

  delete(id) {
    const index = this.embeds.findIndex((embed) => embed.id === id);
    if (index < 0) return null;
    const [removed] = this.embeds.splice(index, 1);
    this.persist();
    return removed;
  }

  persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.embeds), { mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
    try { fs.chmodSync(this.filePath, 0o600); } catch {}
  }
}
