const DISCORD_ID = /^\d{15,25}$/;

const PIN_MAX_LENGTHS = new Map([
  ['action_send_message:content', 2000],
  ['action_edit_message:content', 2000],
  ['action_reply_interaction:content', 2000],
  ['action_edit_interaction_reply:content', 2000],
  ['build_embed:title', 256],
  ['build_embed:description', 4096],
  ['build_embed:author_name', 256],
  ['build_embed:footer_text', 2048],
  ['build_embed:url', 2048],
  ['build_embed:author_url', 2048],
  ['build_embed:thumbnail_url', 2048],
  ['build_embed:image_url', 2048],
  ['action_create_channel:name', 100],
  ['action_create_channel:topic', 1024],
  ['action_edit_channel:name', 100],
  ['action_edit_channel:topic', 1024],
  ['action_create_thread:name', 100],
  ['action_start_thread_from_message:name', 100],
  ['action_create_role:name', 100],
  ['action_set_presence:activity_text', 128],
  ['action_set_presence:custom_status_text', 128],
  ['action_set_custom_status:status_text', 128],
  ['action_voice_channel_status:status', 500]
]);

const ID_LABELS = {
  user_id: 'user ID',
  channel_id: 'channel ID',
  thread_id: 'thread ID',
  message_id: 'message ID',
  guild_id: 'server ID',
  role_id: 'role ID',
  interaction_id: 'interaction ID',
  application_id: 'application ID',
  parent_id: 'channel ID',
  category_id: 'category ID'
};
const DYNAMIC_PIN_ID_PATTERN = /^(arg|slot|item|argument|part|value|input|output|case)_(\d+)$/;
const FLEXIBLE_PIN_TYPES = new Set(['arg', 'any', 'variable', 'object', 'array']);
//
export function fieldLimitWarning({ nodeType, pin, value, node } = {}) {
  if (!pin || typeof value !== 'string') return '';
  if (DYNAMIC_PIN_ID_PATTERN.test(pin.id) || FLEXIBLE_PIN_TYPES.has(pin.type)) return '';
  const createChannelTopicTypes = new Set(['15', '16', 'forum', 'media']);
  if (nodeType === 'action_create_channel' && pin.id === 'topic' && createChannelTopicTypes.has(String(node?.data?.channel_type ?? '').trim().toLowerCase())) {
    return '';
  }
  const text = value.trim();
  if (!text || text.includes('{{')) return '';
  if (pin.type === 'number' && !Number.isFinite(Number(text))) {
    return `resolved value “${text.slice(0, 60)}” is not a number.`;
  }
  const maximum = PIN_MAX_LENGTHS.get(`${nodeType}:${pin.id}`);
  if (maximum && text.length > maximum) {
    return `resolved text is ${text.length} characters, over the ${maximum} character limit.`;
  }
  const idLabel = pin.semanticType ? ID_LABELS[pin.semanticType] : '';
  if (idLabel && !DISCORD_ID.test(text)) {
    return `resolved value “${text.slice(0, 60)}” does not look like a Discord ${idLabel}.`;
  }
  return '';
}
