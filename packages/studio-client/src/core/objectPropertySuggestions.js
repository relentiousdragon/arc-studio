import { DISCORD_OBJECT_PROPERTIES } from 'chezcord';
import { flattenSlashParameters } from '../../../studio-server/src/engine/SlashCommandOptions.js';
import { getFunctionInputArguments, functionArgumentPinId } from '../../../studio-server/src/engine/FunctionGraphContract.js';

const OBJECT_PROPERTY_GROUPS = Object.freeze({
  attachment: [
    { key: 'id', label: 'Attachment ID', desc: 'Snowflake ID of the attachment' },
    { key: 'filename', label: 'Filename', desc: 'Uploaded filename' },
    { key: 'url', label: 'URL', desc: 'Attachment download URL' },
    { key: 'content_type', label: 'Content Type', desc: 'MIME type when available' },
    { key: 'size', label: 'Size', desc: 'File size in bytes' }
  ]
});

function getSlashOptionTypeProperties(type, prefix = '', option = null) {
  const typeNum = Number(type);
  let choiceDesc = '';
  if (Array.isArray(option?.choices) && option.choices.length > 0) {
    choiceDesc = ` · Choices: ${option.choices.map((c) => `${c.name || c.value} (${JSON.stringify(c.value)})`).join(', ')}`;
  } else if (option?.autocomplete) {
    choiceDesc = ' · Autocomplete';
  }
  const baseProps = [
    { key: 'value', label: 'Value', desc: `The value of the ${prefix || 'argument'}${choiceDesc}` },
    { key: 'name', label: 'Name', desc: `The parameter name of the ${prefix || 'argument'}` }
  ];

  let specificProps = [];
  if (typeNum === 6) {
    specificProps = DISCORD_OBJECT_PROPERTIES.user || [];
  } else if (typeNum === 7) {
    specificProps = DISCORD_OBJECT_PROPERTIES.channel || [];
  } else if (typeNum === 8) {
    specificProps = DISCORD_OBJECT_PROPERTIES.role || [];
  } else if (typeNum === 11) {
    specificProps = OBJECT_PROPERTY_GROUPS.attachment || [];
  } else if (typeNum === 9) {
    const combined = [...(DISCORD_OBJECT_PROPERTIES.user || []), ...(DISCORD_OBJECT_PROPERTIES.role || [])];
    const seen = new Set();
    specificProps = combined.filter((p) => {
      if (seen.has(p.key)) return false;
      seen.add(p.key);
      return true;
    });
  }

  const allProps = [...baseProps, ...specificProps];
  const uniqueProps = [];
  const seenKeys = new Set();
  for (const p of allProps) {
    if (!seenKeys.has(p.key)) {
      seenKeys.add(p.key);
      uniqueProps.push(p);
    }
  }

  if (!prefix) return uniqueProps;
  return uniqueProps.map((p) => ({
    key: `${prefix}.${p.key}`,
    label: `${prefix}.${p.label || p.key}`,
    desc: p.desc
  }));
}

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
        let desc = String(option.description || '').trim() || `Slash command ${typeLabel.toLowerCase()} argument`;
        if (Array.isArray(option.choices) && option.choices.length > 0) {
          const choicesText = option.choices.map((c) => `${c.name || c.value} (${JSON.stringify(c.value)})`).join(', ');
          desc = desc ? `${desc} · Choices: ${choicesText}` : `Choices: ${choicesText}`;
        }
        properties.set(key, {
          key,
          label: typeLabel,
          desc
        });
        for (const child of getSlashOptionTypeProperties(type, key, option)) {
          if (!properties.has(child.key)) {
            properties.set(child.key, child);
          }
        }
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

function getStaticValueProperties(value, description = 'Property from the configured object value') {
  const properties = [];
  const append = (current, prefix = '', depth = 0) => {
    if (depth >= 4 || properties.length >= 100 || !current || typeof current !== 'object') return;
    if (Array.isArray(current)) {
      if (current.length) append(current[0], `${prefix}[0]`, depth + 1);
      return;
    }
    for (const key of Object.keys(current)) {
      if (properties.length >= 100) return;
      const part = /^[A-Za-z_$][A-Za-z0-9_$-]*$/.test(key) ? key : `[${JSON.stringify(key)}]`;
      const property = prefix ? (part.startsWith('[') ? `${prefix}${part}` : `${prefix}.${part}`) : part;
      properties.push({ key: property, label: key, desc: description });
      const child = current[key];
      if (child && typeof child === 'object') append(child, property, depth + 1);
    }
  };
  append(value, '', 0);
  return properties;
}

function getStaticOutputValue(sourceNode, sourcePin, graphVariables) {
  if (sourceNode.type === 'variable_get' && sourcePin === 'value') {
    return graphVariables.find((variable) => variable.id === sourceNode.data?.variableId)?.initialValue;
  }
  if (sourceNode.type === 'data_parse_json' && typeof sourceNode.data?.json === 'string') {
    try { return JSON.parse(sourceNode.data.json); } catch { return undefined; }
  }
  const value = sourceNode.data?.[sourcePin];
  if (value !== undefined && typeof value !== 'string') return value;
  if (sourcePin === 'value') return sourceNode.data?.value;
  return undefined;
}

function objectPropertyGroup(sourceNode, sourcePin, sourcePinDefinition) {
  const pin = String(sourcePin || '').toLowerCase();
  if (pin === 'mentions' || pin === 'author' || pin === 'user' || pin === 'target_user' || pin.endsWith('_user')) return 'user';
  if (pin === 'mention_roles' || pin === 'role' || pin === 'target_role' || pin.endsWith('_role')) return 'role';
  if (pin.includes('member')) return 'member';
  if (pin.includes('message')) return 'message';
  if (pin.includes('channel')) return 'channel';
  if (pin.includes('guild') || pin.includes('server')) return 'guild';
  if (pin.includes('interaction')) return 'interaction';
  if (pin.includes('emoji')) return 'emoji';
  if (pin.includes('author')) return 'user';
  if (sourcePinDefinition?.colorType === 'attachment') return 'attachment';
  const sourceType = String(sourceNode?.type || '').toLowerCase();
  if (sourceType.includes('message')) return 'message';
  if (sourceType.includes('member')) return 'member';
  if (sourceType.includes('user')) return 'user';
  if (sourceType.includes('channel')) return 'channel';
  if (sourceType.includes('role')) return 'role';
  if (sourceType.includes('guild')) return 'guild';
  if (sourceType.includes('interaction') || sourceType.includes('button') || sourceType.includes('select') || sourceType.includes('slash') || sourceType.includes('modal')) return 'interaction';
  return null;
}

export function resolveInferredObjectProperties(pinIds, incomingConnections, nodeById, nodeDefinitionsById, graphVariables = []) {
  const pinList = Array.isArray(pinIds) ? pinIds : [pinIds];
  let wire = null;
  for (const pinId of pinList) {
    wire = incomingConnections?.get?.(pinId);
    if (wire) break;
  }
  if (!wire) return [];

  const sourceNode = nodeById?.get?.(wire.sourceNodeId);
  if (!sourceNode) return [];

  if (sourceNode.type === 'event_slash_command' || sourceNode.type === 'event_slash_autocomplete') {
    const commandNode = sourceNode.type === 'event_slash_command'
      ? sourceNode
      : [...(nodeById?.values?.() || [])].find((n) => n.type === 'event_slash_command');
    if (wire.sourcePinId === 'options') {
      return commandNode ? getSlashCommandProperties(commandNode) : [];
    }
    if (commandNode) {
      const params = flattenSlashParameters(commandNode.data?.options);
      const matchedParam = params.find((item) => item.pinId === wire.sourcePinId || `option_${item.option?.name}` === wire.sourcePinId);
      if (matchedParam?.option) {
        const opt = matchedParam.option;
        return getSlashOptionTypeProperties(opt.type, '', opt);
      }
    }
  }

  if (sourceNode.type === 'function_input') {
    const args = getFunctionInputArguments(sourceNode);
    const arg = args.find((item) => (
      item.legacy
        ? wire.sourcePinId === 'value'
        : functionArgumentPinId(item) === wire.sourcePinId
          || item.paramId === wire.sourcePinId
          || `arg_${item.paramId}` === wire.sourcePinId
          || wire.sourcePinId.endsWith(item.paramId)
    ));
    if (arg) {
      const name = String(arg.name || '').toLowerCase();
      const valType = String(arg.valueType || '').toLowerCase();
      if (valType === 'user_id' || /(^|_)user(_|$)|author|member/i.test(name)) {
        return DISCORD_OBJECT_PROPERTIES.user || [];
      }
      if (valType === 'channel_id' || valType === 'thread_id' || /(^|_)channel(_|$)|thread/i.test(name)) {
        return DISCORD_OBJECT_PROPERTIES.channel || [];
      }
      if (valType === 'role_id' || /(^|_)role(_|$)/i.test(name)) {
        return DISCORD_OBJECT_PROPERTIES.role || [];
      }
      if (valType === 'guild_id' || /(^|_)guild(_|$)|server/i.test(name)) {
        return DISCORD_OBJECT_PROPERTIES.guild || [];
      }
      if (valType === 'message_id' || /(^|_)message(_|$)/i.test(name)) {
        return DISCORD_OBJECT_PROPERTIES.message || [];
      }
      if (valType === 'interaction_id' || /(^|_)interaction(_|$)/i.test(name)) {
        return DISCORD_OBJECT_PROPERTIES.interaction || [];
      }
      let defaultVal = arg.defaultValue;
      if (typeof defaultVal === 'string' && (defaultVal.trim().startsWith('{') || defaultVal.trim().startsWith('['))) {
        try { defaultVal = JSON.parse(defaultVal); } catch {}
      }
      if (defaultVal && typeof defaultVal === 'object') {
        return getStaticValueProperties(defaultVal, `Property from default value of ${arg.name}`);
      }
    }
  }

  const sourceDefinition = nodeDefinitionsById?.get?.(wire.sourceNodeId);
  const sourcePinDefinition = sourceDefinition?.outputs?.find((pin) => pin.id === wire.sourcePinId);
  if (!sourcePinDefinition) return [];

  if (sourceNode.type === 'data_parse_prefix_command' && wire.sourcePinId === 'arguments') {
    return [
      { key: 'length', label: 'Length', desc: 'Number of parsed arguments' },
      { key: '[0]', label: 'First Argument', desc: 'First parsed command argument' },
      { key: '[1]', label: 'Second Argument', desc: 'Second parsed command argument' }
    ];
  }

  const outputType = sourcePinDefinition.colorType || sourcePinDefinition.type;
  if (outputType !== 'object' && outputType !== 'array') return [];

  const group = objectPropertyGroup(sourceNode, wire.sourcePinId, sourcePinDefinition);
  if (group && OBJECT_PROPERTY_GROUPS[group]) return OBJECT_PROPERTY_GROUPS[group];
  if (group && DISCORD_OBJECT_PROPERTIES[group]) return DISCORD_OBJECT_PROPERTIES[group];
  return getStaticValueProperties(getStaticOutputValue(sourceNode, wire.sourcePinId, graphVariables));
}

export function getConnectedTemplateInputPaths(inputs, incomingConnections, nodeById, nodeDefinitionsById, graphVariables = []) {
  const paths = [];
  const pinIds = new Set([
    ...(inputs || []).map((pin) => pin?.id),
    ...(incomingConnections?.keys?.() || [])
  ]);
  for (const pinId of pinIds) {
    const argument = /^arg_(\d+)$/.exec(pinId || '');
    const slot = /^slot_(.+)$/.exec(pinId || '');
    if (!argument && !slot) continue;
    const root = argument ? `arg${argument[1]}` : slot[1];
    for (const property of resolveInferredObjectProperties(pinId, incomingConnections, nodeById, nodeDefinitionsById, graphVariables)) {
      paths.push({
        path: `${root}.${property.key}`,
        label: `${root}.${property.key}`,
        description: property.desc
      });
    }
  }
  return paths;
}
