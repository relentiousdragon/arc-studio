import { DISCORD_OBJECT_PROPERTIES } from 'chezcord';

const OBJECT_PROPERTY_GROUPS = Object.freeze({
  attachment: [
    { key: 'id', label: 'Attachment ID', desc: 'Snowflake ID of the attachment' },
    { key: 'filename', label: 'Filename', desc: 'Uploaded filename' },
    { key: 'url', label: 'URL', desc: 'Attachment download URL' },
    { key: 'content_type', label: 'Content Type', desc: 'MIME type when available' },
    { key: 'size', label: 'Size', desc: 'File size in bytes' }
  ]
});

function getSlashCommandProperties(sourceNode) {
  const properties = new Map();
  const visit = (options = []) => {
    for (const option of Array.isArray(options) ? options : []) {
      const type = Number(option?.type || 3);
      if (type === 1 || type === 2) {
        visit(option.options);
        continue;
      }
      const key = String(option?.name || '').trim();
      if (key && !properties.has(key)) {
        const typeLabel = ({
          3: 'Text',
          4: 'Integer',
          5: 'Boolean',
          6: 'User',
          7: 'Channel',
          8: 'Role',
          9: 'Mentionable',
          10: 'Number',
          11: 'Attachment'
        })[type] || 'Argument';
        properties.set(key, {
          key,
          label: typeLabel,
          desc: String(option.description || '').trim() || `Slash command ${typeLabel.toLowerCase()} argument`
        });
      }
    }
  };
  visit(sourceNode.data?.options);
  properties.set('$subcommand', {
    key: '$subcommand',
    label: 'Subcommand',
    desc: 'Name of the invoked subcommand, when present'
  });
  properties.set('$subcommand_group', {
    key: '$subcommand_group',
    label: 'Subcommand Group',
    desc: 'Name of the invoked subcommand group, when present'
  });
  return [...properties.values()];
}

function getStaticJsonProperties(sourceNode) {
  if (sourceNode.type !== 'data_parse_json' || typeof sourceNode.data?.json !== 'string') return [];
  let value;
  try {
    value = JSON.parse(sourceNode.data.json);
  } catch {
    return [];
  }
  const properties = [];
  const append = (current, prefix = '', depth = 0) => {
    if (depth >= 4 || properties.length >= 100 || !current || typeof current !== 'object') return;
    for (const key of Object.keys(current)) {
      if (properties.length >= 100) return;
      const part = /^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(key) ? key : `[${JSON.stringify(key)}]`;
      const property = prefix ? (part.startsWith('[') ? `${prefix}${part}` : `${prefix}.${part}`) : part;
      properties.push({ key: property, label: key, desc: 'Property from the configured JSON value' });
      const child = current[key];
      if (child && typeof child === 'object') append(child, property, depth + 1);
    }
  };
  append(value);
  return properties;
}

function objectPropertyGroup(sourceNode, sourcePin, sourcePinDefinition) {
  const pin = `${sourcePin} ${sourcePinDefinition?.label || ''}`.toLowerCase();
  if (pin.includes('message')) return 'message';
  if (pin.includes('member')) return 'member';
  if (pin.includes('author') || pin === 'user' || pin.includes('target_user')) return 'user';
  if (pin.includes('channel')) return 'channel';
  if (pin.includes('guild') || pin.includes('server')) return 'guild';
  if (pin.includes('role')) return 'role';
  if (pin.includes('interaction')) return 'interaction';
  if (pin.includes('emoji')) return 'emoji';
  if (sourcePinDefinition?.colorType === 'attachment') return 'attachment';
  const sourceType = String(sourceNode?.type || '').toLowerCase();
  if (sourceType.includes('message')) return 'message';
  if (sourceType.includes('member')) return 'member';
  if (sourceType.includes('user')) return 'user';
  if (sourceType.includes('channel')) return 'channel';
  if (sourceType.includes('role')) return 'role';
  if (sourceType.includes('guild')) return 'guild';
  if (sourceType.includes('interaction') || sourceType.includes('button') || sourceType.includes('select')) return 'interaction';
  return null;
}

export function resolveInferredObjectProperties(pinIds, incomingConnections, nodeById, nodeDefinitionsById) {
  const pinList = Array.isArray(pinIds) ? pinIds : [pinIds];
  let wire = null;
  for (const pinId of pinList) {
    wire = incomingConnections?.get?.(pinId);
    if (wire) break;
  }
  if (!wire) return [];

  const sourceNode = nodeById?.get?.(wire.sourceNodeId);
  const sourceDefinition = nodeDefinitionsById?.get?.(wire.sourceNodeId);
  const sourcePinDefinition = sourceDefinition?.outputs?.find((pin) => pin.id === wire.sourcePinId);
  if (!sourceNode || !sourcePinDefinition) return [];

  if (sourceNode.type === 'event_slash_command' && wire.sourcePinId === 'options') {
    return getSlashCommandProperties(sourceNode);
  }

  const outputType = sourcePinDefinition.colorType || sourcePinDefinition.type;
  if (outputType !== 'object' && outputType !== 'array') return [];

  const group = objectPropertyGroup(sourceNode, wire.sourcePinId, sourcePinDefinition);
  if (group && OBJECT_PROPERTY_GROUPS[group]) return OBJECT_PROPERTY_GROUPS[group];
  if (group && DISCORD_OBJECT_PROPERTIES[group]) return DISCORD_OBJECT_PROPERTIES[group];
  return getStaticJsonProperties(sourceNode);
}
