const MESSAGE_EVENTS = new Set(['event_message_create', 'event_message_update', 'event_message_delete']);
const THREAD_EVENTS = new Set(['event_thread_create', 'event_thread_update', 'event_thread_delete']);
const GUILD_EVENTS = new Set(['event_guild_create', 'event_guild_update', 'event_guild_delete']);
const CHANNEL_EVENTS = new Set(['event_channel_create', 'event_channel_update', 'event_channel_delete', 'event_channel_pins_update']);
const ROLE_EVENTS = new Set(['event_role_create', 'event_role_update', 'event_role_delete']);
const SCHEDULED_EVENTS = new Set(['event_scheduled_event_create', 'event_scheduled_event_update', 'event_scheduled_event_delete']);
const INTERACTION_EVENTS = new Set(['event_slash_command', 'event_slash_autocomplete', 'event_button_click', 'event_select_menu', 'event_modal_submit']);

const UNIVERSAL_PATHS = Object.freeze([
  { path: 'guild.id', label: 'Server ID' },
  { path: 'guild.name', label: 'Server name' },
  { path: 'channel.id', label: 'Channel ID' },
  { path: 'channel.name', label: 'Channel name' },
  { path: 'user.id', label: 'User ID' },
  { path: 'user.username', label: 'Username' },
  { path: 'user.display_name', label: 'Display name' },
  { path: 'user.mention', label: 'User mention' }
]);

const USER_PATHS = Object.freeze([
  { path: 'user.id', label: 'User ID' },
  { path: 'user.username', label: 'Username' },
  { path: 'user.display_name', label: 'Display name' },
  { path: 'user.mention', label: 'User mention' }
]);

const AUTHOR_PATHS = Object.freeze([
  { path: 'author.id', label: 'Author ID' },
  { path: 'author.username', label: 'Author username' },
  { path: 'author.display_name', label: 'Author display name' },
  { path: 'author.mention', label: 'Author mention' },
  { path: 'author.bot', label: 'Author is a bot' }
]);

const EVENT_PATHS = Object.freeze({
  event_message_create: [
    ...AUTHOR_PATHS,
    { path: 'content', label: 'Message content' },
    { path: 'message.id', label: 'Message ID' },
    { path: 'message.content', label: 'Message content' },
    { path: 'member.nick', label: 'Member nickname' },
    { path: 'channel.id', label: 'Channel ID' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_message_update: [
    ...AUTHOR_PATHS,
    { path: 'content', label: 'Message content' },
    { path: 'message.id', label: 'Message ID' },
    { path: 'message.content', label: 'Message content' },
    { path: 'member.nick', label: 'Member nickname' }
  ],
  event_message_delete: [
    { path: 'message.id', label: 'Message ID' },
    { path: 'channel.id', label: 'Channel ID' },
    { path: 'guild.id', label: 'Server ID' }
  ],
  event_message_reaction_remove_all: [
    { path: 'message.id', label: 'Message ID' },
    { path: 'channel.id', label: 'Channel ID' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_reaction_add: [
    ...USER_PATHS,
    { path: 'member.nick', label: 'Member nickname' },
    { path: 'emoji.name', label: 'Emoji name' },
    { path: 'emoji.id', label: 'Emoji ID' },
    { path: 'emoji.animated', label: 'Emoji is animated' },
    { path: 'message.id', label: 'Message ID' },
    { path: 'channel.id', label: 'Channel ID' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_reaction_remove: [
    ...USER_PATHS,
    { path: 'member.nick', label: 'Member nickname' },
    { path: 'emoji.name', label: 'Emoji name' },
    { path: 'emoji.id', label: 'Emoji ID' },
    { path: 'message.id', label: 'Message ID' },
    { path: 'channel.id', label: 'Channel ID' }
  ],
  event_slash_command: [
    ...USER_PATHS,
    { path: 'member.nick', label: 'Member nickname' },
    { path: 'interaction.id', label: 'Interaction ID' },
    { path: 'interaction.token', label: 'Interaction token' },
    { path: 'interaction.command_name', label: 'Command name' },
    { path: 'interaction.subcommand_group', label: 'Subcommand group' },
    { path: 'interaction.subcommand', label: 'Subcommand' },
    { path: 'interaction.options', label: 'Command options object' },
    { path: 'channel.id', label: 'Channel ID' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_slash_autocomplete: [
    ...USER_PATHS,
    { path: 'interaction.id', label: 'Interaction ID' },
    { path: 'interaction.command_name', label: 'Command name' },
    { path: 'interaction.focused_option', label: 'Focused option name' },
    { path: 'interaction.focused_value', label: 'Focused option value' },
    { path: 'channel.id', label: 'Channel ID' }
  ],
  event_button_click: [
    ...USER_PATHS,
    { path: 'member.nick', label: 'Member nickname' },
    { path: 'interaction.id', label: 'Interaction ID' },
    { path: 'interaction.token', label: 'Interaction token' },
    { path: 'interaction.custom_id', label: 'Button custom ID' },
    { path: 'message.id', label: 'Message ID' },
    { path: 'channel.id', label: 'Channel ID' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_select_menu: [
    ...USER_PATHS,
    { path: 'member.nick', label: 'Member nickname' },
    { path: 'interaction.id', label: 'Interaction ID' },
    { path: 'interaction.token', label: 'Interaction token' },
    { path: 'interaction.custom_id', label: 'Select custom ID' },
    { path: 'interaction.values', label: 'Selected values' },
    { path: 'interaction.first_value', label: 'First selected value' },
    { path: 'message.id', label: 'Message ID' },
    { path: 'channel.id', label: 'Channel ID' }
  ],
  event_modal_submit: [
    ...USER_PATHS,
    { path: 'member.nick', label: 'Member nickname' },
    { path: 'interaction.id', label: 'Interaction ID' },
    { path: 'interaction.token', label: 'Interaction token' },
    { path: 'interaction.custom_id', label: 'Modal custom ID' },
    { path: 'interaction.fields', label: 'Submitted fields object' },
    { path: 'channel.id', label: 'Channel ID' }
  ],
  event_member_join: [
    ...USER_PATHS,
    { path: 'member.nick', label: 'Member nickname' },
    { path: 'member.joined_at', label: 'Joined at' },
    { path: 'guild.name', label: 'Server name' },
    { path: 'guild.member_count', label: 'Member count' }
  ],
  event_member_remove: [
    ...USER_PATHS,
    { path: 'member.nick', label: 'Member nickname' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_voice_state_update: [
    ...USER_PATHS,
    { path: 'member.nick', label: 'Member nickname' },
    { path: 'voice.channel_id', label: 'Voice channel ID' },
    { path: 'voice.self_mute', label: 'Self muted' },
    { path: 'voice.self_deaf', label: 'Self deafened' },
    { path: 'voice.self_stream', label: 'Streaming' },
    { path: 'voice.self_video', label: 'Camera on' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_presence_update: [
    ...USER_PATHS,
    { path: 'presence.status', label: 'Presence status' },
    { path: 'presence.activities', label: 'Activities' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_typing_start: [
    ...USER_PATHS,
    { path: 'member.nick', label: 'Member nickname' },
    { path: 'channel.id', label: 'Channel ID' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_channel_create: [
    { path: 'channel.id', label: 'Channel ID' },
    { path: 'channel.name', label: 'Channel name' },
    { path: 'channel.type', label: 'Channel type' },
    { path: 'channel.topic', label: 'Channel topic' },
    { path: 'channel.parent_id', label: 'Category ID' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_channel_update: [
    { path: 'channel.id', label: 'Channel ID' },
    { path: 'channel.name', label: 'Channel name' },
    { path: 'channel.type', label: 'Channel type' },
    { path: 'channel.topic', label: 'Channel topic' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_channel_delete: [
    { path: 'channel.id', label: 'Channel ID' },
    { path: 'channel.name', label: 'Channel name' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_channel_pins_update: [
    { path: 'channel.id', label: 'Channel ID' },
    { path: 'last_pin_timestamp', label: 'Last pin timestamp' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_thread_create: [
    { path: 'thread.id', label: 'Thread ID' },
    { path: 'thread.name', label: 'Thread name' },
    { path: 'thread.parent_id', label: 'Parent channel ID' },
    { path: 'thread.owner_id', label: 'Thread owner ID' },
    { path: 'thread.message_count', label: 'Message count' },
    { path: 'channel.id', label: 'Thread ID' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_thread_update: [
    { path: 'thread.id', label: 'Thread ID' },
    { path: 'thread.name', label: 'Thread name' },
    { path: 'thread.archived', label: 'Thread archived' },
    { path: 'thread.locked', label: 'Thread locked' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_thread_delete: [
    { path: 'thread.id', label: 'Thread ID' },
    { path: 'thread.parent_id', label: 'Parent channel ID' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_guild_create: [
    { path: 'guild.id', label: 'Server ID' },
    { path: 'guild.name', label: 'Server name' },
    { path: 'guild.owner_id', label: 'Owner ID' },
    { path: 'guild.member_count', label: 'Member count' },
    { path: 'guild.icon', label: 'Server icon hash' }
  ],
  event_guild_update: [
    { path: 'guild.id', label: 'Server ID' },
    { path: 'guild.name', label: 'Server name' },
    { path: 'guild.owner_id', label: 'Owner ID' }
  ],
  event_guild_delete: [
    { path: 'guild.id', label: 'Server ID' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_guild_ban_add: [
    ...USER_PATHS,
    { path: 'guild.name', label: 'Server name' }
  ],
  event_guild_ban_remove: [
    ...USER_PATHS,
    { path: 'guild.name', label: 'Server name' }
  ],
  event_role_create: [
    { path: 'role.id', label: 'Role ID' },
    { path: 'role.name', label: 'Role name' },
    { path: 'role.color', label: 'Role color number' },
    { path: 'role.position', label: 'Role position' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_role_update: [
    { path: 'role.id', label: 'Role ID' },
    { path: 'role.name', label: 'Role name' },
    { path: 'role.color', label: 'Role color number' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_role_delete: [
    { path: 'role.id', label: 'Role ID' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_invite_create: [
    { path: 'invite.code', label: 'Invite code' },
    { path: 'invite.url', label: 'Invite URL' },
    { path: 'invite.uses', label: 'Invite uses' },
    { path: 'invite.inviter.username', label: 'Inviter username' },
    { path: 'invite.inviter.id', label: 'Inviter ID' },
    { path: 'invite.channel.name', label: 'Invite channel name' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_invite_delete: [
    { path: 'invite.code', label: 'Invite code' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_scheduled_event_create: [
    { path: 'scheduled_event.id', label: 'Event ID' },
    { path: 'scheduled_event.name', label: 'Event name' },
    { path: 'scheduled_event.start_time', label: 'Start time' },
    { path: 'scheduled_event.status', label: 'Event status' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_scheduled_event_update: [
    { path: 'scheduled_event.id', label: 'Event ID' },
    { path: 'scheduled_event.name', label: 'Event name' },
    { path: 'scheduled_event.start_time', label: 'Start time' },
    { path: 'scheduled_event.status', label: 'Event status' }
  ],
  event_scheduled_event_delete: [
    { path: 'scheduled_event.id', label: 'Event ID' },
    { path: 'scheduled_event.name', label: 'Event name' }
  ],
  event_automod_action: [
    ...AUTHOR_PATHS,
    { path: 'content', label: 'Message content' },
    { path: 'automod.rule_id', label: 'Rule ID' },
    { path: 'automod.matched_keyword', label: 'Matched keyword' },
    { path: 'automod.action_type', label: 'Action type' },
    { path: 'channel.id', label: 'Channel ID' },
    { path: 'guild.name', label: 'Server name' }
  ],
  event_bot_ready: [
    { path: 'user.id', label: 'Bot user ID' },
    { path: 'user.username', label: 'Bot username' },
    { path: 'user.mention', label: 'Bot mention' }
  ],
  event_bot_startup: [],
  event_cron: [
    { path: 'cron.scheduled_at', label: 'Scheduled time' },
    { path: 'cron.time_zone', label: 'Schedule time zone' },
    { path: 'cron.expression', label: 'Cron expression' }
  ],
  event_websocket_message: [
    { path: 'websocket.connection_id', label: 'Connection ID' },
    { path: 'websocket.message', label: 'Socket message' }
  ],
  event_websocket_open: [
    { path: 'websocket.connection_id', label: 'Connection ID' },
    { path: 'websocket.url', label: 'Socket URL' }
  ],
  event_websocket_close: [
    { path: 'websocket.connection_id', label: 'Connection ID' },
    { path: 'websocket.code', label: 'Close code' },
    { path: 'websocket.reason', label: 'Close reason' }
  ],
  event_websocket_error: [
    { path: 'websocket.connection_id', label: 'Connection ID' },
    { path: 'websocket.message', label: 'Error message' }
  ]
});
//
export function eventTemplatePaths(type) {
  const specific = EVENT_PATHS[type] || [];
  const paths = new Map();
  for (const item of [...UNIVERSAL_PATHS, ...specific]) {
    if (!item?.path) continue;
    const key = item.path.toLowerCase();
    if (paths.has(key)) continue;
    paths.set(key, { path: item.path, label: item.label || item.path });
  }
  return [...paths.values()];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function userView(user) {
  const source = asObject(user);
  if (!source) return null;
  const id = source.id ? String(source.id) : '';
  const username = source.username ? String(source.username) : '';
  const displayName = source.global_name || source.display_name || source.nick || username;
  const avatar = source.avatar && id
    ? `https://cdn.discordapp.com/avatars/${id}/${source.avatar}.${String(source.avatar).startsWith('a_') ? 'gif' : 'png'}?size=128`
    : '';
  return {
    ...source,
    id,
    username,
    global_name: source.global_name || '',
    display_name: displayName,
    avatar_url: avatar,
    mention: id ? `<@${id}>` : ''
  };
}

function userFrom(payload) {
  return payload?.user || payload?.member?.user || payload?.author || payload?.inviter || null;
}

function guildView(type, payload, cached) {
  const isGuildEvent = GUILD_EVENTS.has(type);
  const source = asObject(cached);
  const merged = {
    ...(source || {}),
    ...(isGuildEvent ? {
      id: payload?.id,
      name: payload?.name,
      owner_id: payload?.owner_id,
      member_count: payload?.member_count,
      icon: payload?.icon
    } : {})
  };
  const id = merged.id || payload?.guild_id || payload?.guild?.id || '';
  const name = merged.name || payload?.guild?.name || '';
  if (!id && !name) return null;
  return { ...merged, id: String(id), name: String(name || '') };
}

function channelView(type, payload, cached) {
  const isChannelEvent = CHANNEL_EVENTS.has(type) || THREAD_EVENTS.has(type);
  const source = asObject(cached);
  const merged = {
    ...(source || {}),
    ...(isChannelEvent ? {
      id: payload?.id,
      name: payload?.name,
      type: payload?.type,
      parent_id: payload?.parent_id,
      topic: payload?.topic
    } : {})
  };
  const id = merged.id || payload?.channel_id || payload?.channel?.id || '';
  const name = merged.name || payload?.channel?.name || '';
  if (!id && !name) return null;
  return { ...merged, id: String(id), name: String(name || '') };
}

function interactionOptions(options = []) {
  const result = {};
  const walk = (items) => {
    for (const item of Array.isArray(items) ? items : []) {
      if ([1, 2].includes(Number(item?.type))) walk(item.options);
      else if (item?.name) result[item.name] = item.value ?? item.options ?? '';
    }
  };
  walk(options);
  return result;
}

function modalFields(components = []) {
  const result = {};
  const walk = (items) => {
    for (const item of Array.isArray(items) ? items : []) {
      const customId = item?.component?.custom_id || item?.custom_id;
      if (customId) result[customId] = item.value ?? item.values ?? item.component?.value ?? '';
      walk(item?.components || item?.component?.components);
    }
  };
  walk(components);
  return result;
}

function interactionView(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload.data || {};
  const focused = (data.options || []).find((option) => option?.focused);
  return {
    id: payload.id || '',
    token: payload.token || '',
    application_id: payload.application_id || '',
    type: Number(payload.type) || 0,
    command_name: data.name || '',
    custom_id: data.custom_id || '',
    component_type: data.component_type ?? null,
    values: Array.isArray(data.values) ? data.values : [],
    first_value: Array.isArray(data.values) ? data.values[0] ?? '' : '',
    focused_option: focused?.name || '',
    focused_value: focused?.value ?? '',
    subcommand_group: data.options?.find((option) => Number(option?.type) === 2)?.name || '',
    subcommand: data.options?.find((option) => Number(option?.type) === 1)?.name || '',
    options: interactionOptions(data.options),
    fields: modalFields(data.components)
  };
}

function scheduledEventView(type, payload) {
  if (!SCHEDULED_EVENTS.has(type) || !payload) return null;
  return { ...payload, id: payload.id || '', name: payload.name || '' };
}

function automodView(type, payload) {
  if (type !== 'event_automod_action' || !payload) return null;
  return {
    rule_id: payload.rule_id || payload.rule_trigger_type || '',
    matched_keyword: payload.matched_keyword || '',
    matched_content: payload.matched_content || '',
    action_type: payload.action?.type ?? null,
    action: payload.action || null
  };
}

function websocketView(type, payload) {
  if (!String(type).startsWith('event_websocket_') || !payload) return null;
  return {
    connection_id: payload.connectionId || payload.connection_id || '',
    message: payload.message ?? payload.data ?? '',
    code: payload.code ?? '',
    reason: payload.reason ?? '',
    url: payload.url || ''
  };
}
//
export function buildEventTemplateValues(type, payload, directory = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const isInteraction = INTERACTION_EVENTS.has(type);
  const values = {
    event: safePayload,
    guild: guildView(type, safePayload, directory?.guild),
    channel: channelView(type, safePayload, directory?.channel),
    user: userView(userFrom(safePayload)),
    author: userView(safePayload.author || userFrom(safePayload)),
    member: asObject(safePayload.member),
    message: MESSAGE_EVENTS.has(type) ? safePayload : asObject(safePayload.message),
    thread: THREAD_EVENTS.has(type) ? safePayload : asObject(safePayload.thread),
    interaction: isInteraction ? interactionView(safePayload) : null,
    role: ROLE_EVENTS.has(type) ? safePayload : asObject(safePayload.role),
    emoji: asObject(safePayload.emoji) || (safePayload.emoji_id ? { id: String(safePayload.emoji_id), name: safePayload.emoji_name || '' } : null),
    invite: asObject(safePayload.invite) || (safePayload.code ? {
      ...safePayload,
      url: safePayload.url || `https://discord.gg/${safePayload.code}`
    } : null),
    presence: type === 'event_presence_update' ? safePayload : asObject(safePayload.presence),
    voice: type === 'event_voice_state_update' ? {
      channel_id: safePayload.channel_id || '',
      session_id: safePayload.session_id || '',
      self_mute: Boolean(safePayload.self_mute),
      self_deaf: Boolean(safePayload.self_deaf),
      self_stream: Boolean(safePayload.self_stream),
      self_video: Boolean(safePayload.self_video),
      server_mute: Boolean(safePayload.mute),
      server_deaf: Boolean(safePayload.deaf)
    } : null,
    scheduled_event: scheduledEventView(type, safePayload),
    automod: automodView(type, safePayload),
    websocket: websocketView(type, safePayload),
    cron: type === 'event_cron' ? {
      node_id: safePayload.cronNodeId || '',
      scheduled_at: safePayload.scheduledAt || new Date().toISOString(),
      time_zone: safePayload.timeZone || 'UTC',
      expression: safePayload.cronExpression || ''
    } : null,
    last_pin_timestamp: safePayload.last_pin_timestamp || ''
  };
  return values;
}
