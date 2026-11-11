export const API_VERSION = 10;
export const API_BASE = `https://discord.com/api/v${API_VERSION}`;
export const GATEWAY_BASE = `wss://gateway.discord.gg/?v=${API_VERSION}&encoding=json`;
export const CDN_BASE = 'https://cdn.discordapp.com';
//
export const GatewayOpcodes = Object.freeze({
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  PRESENCE_UPDATE: 3,
  VOICE_STATE_UPDATE: 4,
  RESUME: 6,
  RECONNECT: 7,
  REQUEST_GUILD_MEMBERS: 8,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11
});

export const GatewayCapabilities = Object.freeze({
  CHANNEL_OBFUSCATION: 1 << 15
});

export const ChannelFlags = Object.freeze({
  PINNED: 1 << 1,
  REQUIRE_TAG: 1 << 4,
  HIDE_MEDIA_DOWNLOAD_OPTIONS: 1 << 15,
  CHANNEL_OBFUSCATED: 1 << 17,
  IS_SPOILER_CHANNEL: 1 << 21
});

export const PermissionFlags = Object.freeze({
  CREATE_INSTANT_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  PRIORITY_SPEAKER: 1n << 8n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  SEND_TTS_MESSAGES: 1n << 12n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  USE_EXTERNAL_EMOJIS: 1n << 18n,
  VIEW_GUILD_INSIGHTS: 1n << 19n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  USE_VAD: 1n << 25n,
  CHANGE_NICKNAME: 1n << 26n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_GUILD_EXPRESSIONS: 1n << 30n,
  USE_APPLICATION_COMMANDS: 1n << 31n,
  REQUEST_TO_SPEAK: 1n << 32n,
  MANAGE_EVENTS: 1n << 33n,
  MANAGE_THREADS: 1n << 34n,
  CREATE_PUBLIC_THREADS: 1n << 35n,
  CREATE_PRIVATE_THREADS: 1n << 36n,
  USE_EXTERNAL_STICKERS: 1n << 37n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
  USE_EMBEDDED_ACTIVITIES: 1n << 39n,
  MODERATE_MEMBERS: 1n << 40n,
  VIEW_CREATOR_MONETIZATION_ANALYTICS: 1n << 41n,
  USE_SOUNDBOARD: 1n << 42n,
  CREATE_GUILD_EXPRESSIONS: 1n << 43n,
  CREATE_EVENTS: 1n << 44n,
  USE_EXTERNAL_SOUNDS: 1n << 45n,
  SEND_VOICE_MESSAGES: 1n << 46n,
  SET_VOICE_CHANNEL_STATUS: 1n << 48n,
  SEND_POLLS: 1n << 49n,
  USE_EXTERNAL_APPS: 1n << 50n,
  PIN_MESSAGES: 1n << 51n,
  BYPASS_SLOWMODE: 1n << 52n
});

const permissionLegacyName = (name) => name.split('_').map((part) =>
  ['TTS', 'VAD'].includes(part) ? part : `${part[0]}${part.slice(1).toLowerCase()}`
).join('');
const permissionLabel = (name) => name.split('_').map((part) =>
  ['TTS', 'VAD'].includes(part) ? part : `${part[0]}${part.slice(1).toLowerCase()}`
).join(' ');

export const PermissionFlagEntries = Object.freeze(Object.entries(PermissionFlags).map(([name, mask]) => Object.freeze({
  name,
  mask,
  bit: mask.toString(2).length - 1,
  legacyName: permissionLegacyName(name),
  label: permissionLabel(name)
})));

export const GatewayCloseCodes = Object.freeze({
  UNKNOWN_ERROR: 4000,
  UNKNOWN_OPCODE: 4001,
  DECODE_ERROR: 4002,
  NOT_AUTHENTICATED: 4003,
  AUTHENTICATION_FAILED: 4004,
  ALREADY_AUTHENTICATED: 4005,
  INVALID_SEQ: 4007,
  RATE_LIMITED: 4008,
  SESSION_TIMED_OUT: 4009,
  INVALID_SHARD: 4010,
  SHARDING_REQUIRED: 4011,
  INVALID_API_VERSION: 4012,
  INVALID_INTENTS: 4013,
  DISALLOWED_INTENTS: 4014
});

export const FatalCloseCodes = new Set([
  GatewayCloseCodes.AUTHENTICATION_FAILED,
  GatewayCloseCodes.INVALID_SHARD,
  GatewayCloseCodes.SHARDING_REQUIRED,
  GatewayCloseCodes.INVALID_API_VERSION,
  GatewayCloseCodes.INVALID_INTENTS,
  GatewayCloseCodes.DISALLOWED_INTENTS
]);

export const GatewayIntents = Object.freeze({
  GUILDS: 1 << 0,
  GUILD_MEMBERS: 1 << 1,
  GUILD_MODERATION: 1 << 2,
  GUILD_EMOJIS_AND_STICKERS: 1 << 3,
  GUILD_INTEGRATIONS: 1 << 4,
  GUILD_WEBHOOKS: 1 << 5,
  GUILD_INVITES: 1 << 6,
  GUILD_VOICE_STATES: 1 << 7,
  GUILD_PRESENCES: 1 << 8,
  GUILD_MESSAGES: 1 << 9,
  GUILD_MESSAGE_REACTIONS: 1 << 10,
  GUILD_MESSAGE_TYPING: 1 << 11,
  DIRECT_MESSAGES: 1 << 12,
  DIRECT_MESSAGE_REACTIONS: 1 << 13,
  DIRECT_MESSAGE_TYPING: 1 << 14,
  MESSAGE_CONTENT: 1 << 15,
  GUILD_SCHEDULED_EVENTS: 1 << 16,
  AUTO_MODERATION_CONFIGURATION: 1 << 20,
  AUTO_MODERATION_EXECUTION: 1 << 21
});

export const ActivityTypes = Object.freeze({
  PLAYING: 0,
  STREAMING: 1,
  LISTENING: 2,
  WATCHING: 3,
  CUSTOM: 4,
  COMPETING: 5
});

export const InteractionTypes = Object.freeze({
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5
});

export const InteractionCallbackTypes = Object.freeze({
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
  MODAL: 9
});

export const ComponentTypes = Object.freeze({
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_INPUT: 4,
  USER_SELECT: 5,
  ROLE_SELECT: 6,
  MENTIONABLE_SELECT: 7,
  CHANNEL_SELECT: 8
});

export const ButtonStyles = Object.freeze({
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
  LINK: 5
});

export const CDN = Object.freeze({
  avatar: (userId, avatarHash, format = 'png', size = 512) => {
    if (avatarHash) {
      return `${CDN_BASE}/avatars/${userId}/${avatarHash}.${avatarHash.startsWith('a_') ? 'gif' : format}?size=${size}`;
    }
    let defaultIndex = 0;
    try {
      defaultIndex = Math.abs(Number(BigInt(userId) >> 22n) % 6);
    } catch {
      defaultIndex = 0;
    }
    return `${CDN_BASE}/embed/avatars/${defaultIndex}.png`;
  },
  banner: (userId, bannerHash, format = 'png', size = 1024) =>
    bannerHash ? `${CDN_BASE}/banners/${userId}/${bannerHash}.${bannerHash.startsWith('a_') ? 'gif' : format}?size=${size}` : null,
  guildIcon: (guildId, iconHash, format = 'png', size = 512) =>
    iconHash ? `${CDN_BASE}/icons/${guildId}/${iconHash}.${iconHash.startsWith('a_') ? 'gif' : format}?size=${size}` : null,
  customEmoji: (emojiId, animated = false, size = 128) =>
    `${CDN_BASE}/emojis/${emojiId}.${animated ? 'gif' : 'png'}?size=${size}`
});

export const MODIFY_COMPONENT_STYLE_OPTIONS = Object.freeze([
  Object.freeze({ value: '', label: 'Keep existing style' }),
  Object.freeze({ value: 'primary', label: 'Primary (Blurple)' }),
  Object.freeze({ value: 'secondary', label: 'Secondary (Gray)' }),
  Object.freeze({ value: 'success', label: 'Success (Green)' }),
  Object.freeze({ value: 'danger', label: 'Danger (Red)' }),
  Object.freeze({ value: 'link', label: 'Link' })
]);

export const DISCORD_OBJECT_PROPERTIES = Object.freeze({
  message: Object.freeze([
    Object.freeze({ key: 'id', label: 'Message ID', desc: 'Snowflake ID of the message' }),
    Object.freeze({ key: 'content', label: 'Content', desc: 'Text content of the message' }),
    Object.freeze({ key: 'channel_id', label: 'Channel ID', desc: 'ID of channel where message was sent' }),
    Object.freeze({ key: 'guild_id', label: 'Server ID', desc: 'ID of server where message was sent' }),
    Object.freeze({ key: 'author', label: 'Author', desc: 'User object of message author' }),
    Object.freeze({ key: 'author.id', label: 'Author ID', desc: 'Author snowflake ID' }),
    Object.freeze({ key: 'author.username', label: 'Author Username', desc: 'Author username' }),
    Object.freeze({ key: 'author.global_name', label: 'Author Display Name', desc: 'Author global display name' }),
    Object.freeze({ key: 'author.avatar', label: 'Author Avatar', desc: 'Avatar hash string' }),
    Object.freeze({ key: 'author.bot', label: 'Author is Bot', desc: 'Whether author is a bot user' }),
    Object.freeze({ key: 'member', label: 'Member', desc: 'Guild member data for author' }),
    Object.freeze({ key: 'flags', label: 'Message Flags', desc: 'Bitfield of message flags' }),
    Object.freeze({ key: 'mention_everyone', label: 'Mentions Everyone', desc: 'Whether the message mentions everyone' }),
    Object.freeze({ key: 'mentions', label: 'Mentions', desc: 'Array of mentioned user objects' }),
    Object.freeze({ key: 'mention_roles', label: 'Mentioned Roles', desc: 'Array of mentioned role IDs' }),
    Object.freeze({ key: 'member.nick', label: 'Member Nickname', desc: 'Server nickname of author' }),
    Object.freeze({ key: 'member.roles', label: 'Member Roles', desc: 'Array of role IDs assigned to author' }),
    Object.freeze({ key: 'message_reference', label: 'Message Reference', desc: 'Reference to a replied or forwarded message' }),
    Object.freeze({ key: 'referenced_message', label: 'Referenced Message', desc: 'Message being replied to, when available' }),
    Object.freeze({ key: 'thread', label: 'Thread', desc: 'Thread created from this message, when available' }),
    Object.freeze({ key: 'components', label: 'Components', desc: 'Components attached to the message' }),
    Object.freeze({ key: 'timestamp', label: 'Timestamp', desc: 'ISO 8601 creation timestamp' }),
    Object.freeze({ key: 'edited_timestamp', label: 'Edited Timestamp', desc: 'When message was edited' }),
    Object.freeze({ key: 'pinned', label: 'Is Pinned', desc: 'Whether message is pinned' }),
    Object.freeze({ key: 'tts', label: 'Is TTS', desc: 'Whether message was text to speech' }),
    Object.freeze({ key: 'attachments', label: 'Attachments', desc: 'Array of attached files' }),
    Object.freeze({ key: 'attachments[0].id', label: 'First Attachment ID', desc: 'ID of the first attached file' }),
    Object.freeze({ key: 'attachments[0].filename', label: 'First Attachment Filename', desc: 'Filename of the first attached file' }),
    Object.freeze({ key: 'attachments[0].url', label: 'First Attachment URL', desc: 'Download URL of the first attached file' }),
    Object.freeze({ key: 'embeds', label: 'Embeds', desc: 'Array of message embeds' }),
    Object.freeze({ key: 'embeds[0].title', label: 'First Embed Title', desc: 'Title of the first embed' }),
    Object.freeze({ key: 'embeds[0].description', label: 'First Embed Description', desc: 'Description of the first embed' }),
    Object.freeze({ key: 'embeds[0].url', label: 'First Embed URL', desc: 'URL of the first embed' }),
    Object.freeze({ key: 'reactions', label: 'Reactions', desc: 'Array of reaction objects' }),
    Object.freeze({ key: 'reactions[0].count', label: 'First Reaction Count', desc: 'Number of times the first emoji was used' }),
    Object.freeze({ key: 'reactions[0].emoji.name', label: 'First Reaction Emoji', desc: 'Name of the first reaction emoji' }),
    Object.freeze({ key: 'type', label: 'Type', desc: 'Message type number' })
  ]),
  user: Object.freeze([
    Object.freeze({ key: 'id', label: 'User ID', desc: 'User snowflake ID' }),
    Object.freeze({ key: 'username', label: 'Username', desc: 'Discord username' }),
    Object.freeze({ key: 'global_name', label: 'Display Name', desc: 'Global display name' }),
    Object.freeze({ key: 'avatar', label: 'Avatar', desc: 'Avatar hash string' }),
    Object.freeze({ key: 'bot', label: 'Is Bot', desc: 'Whether user is a bot' }),
    Object.freeze({ key: 'discriminator', label: 'Discriminator', desc: 'Legacy discriminator tag' }),
    Object.freeze({ key: 'banner', label: 'Banner', desc: 'Banner image hash' }),
    Object.freeze({ key: 'accent_color', label: 'Accent Color', desc: 'Banner accent color code' })
  ]),
  member: Object.freeze([
    Object.freeze({ key: 'nick', label: 'Nickname', desc: 'Guild member nickname' }),
    Object.freeze({ key: 'roles', label: 'Roles', desc: 'Array of role IDs' }),
    Object.freeze({ key: 'joined_at', label: 'Joined Timestamp', desc: 'ISO 8601 join date' }),
    Object.freeze({ key: 'premium_since', label: 'Boost Timestamp', desc: 'When member started boosting server' }),
    Object.freeze({ key: 'deaf', label: 'Is Deafened', desc: 'Whether member is deafened in voice' }),
    Object.freeze({ key: 'mute', label: 'Is Muted', desc: 'Whether member is muted in voice' }),
    Object.freeze({ key: 'user', label: 'User', desc: 'User object of member' }),
    Object.freeze({ key: 'user.id', label: 'User ID', desc: 'Snowflake ID of member user' }),
    Object.freeze({ key: 'user.username', label: 'Username', desc: 'Username of member' })
  ]),
  channel: Object.freeze([
    Object.freeze({ key: 'id', label: 'Channel ID', desc: 'Channel snowflake ID' }),
    Object.freeze({ key: 'name', label: 'Channel Name', desc: 'Name of channel' }),
    Object.freeze({ key: 'type', label: 'Channel Type', desc: 'Channel type number' }),
    Object.freeze({ key: 'flags', label: 'Channel Flags', desc: 'Bitfield of channel flags' }),
    Object.freeze({ key: 'topic', label: 'Topic', desc: 'Channel topic description' }),
    Object.freeze({ key: 'guild_id', label: 'Server ID', desc: 'Server ID channel belongs to' }),
    Object.freeze({ key: 'position', label: 'Position', desc: 'Sorting position in channel list' }),
    Object.freeze({ key: 'parent_id', label: 'Parent ID', desc: 'Category ID of channel' }),
    Object.freeze({ key: 'nsfw', label: 'Is NSFW', desc: 'Whether channel is age restricted' }),
    Object.freeze({ key: 'last_message_id', label: 'Last Message ID', desc: 'ID of the latest message, when available' }),
    Object.freeze({ key: 'rate_limit_per_user', label: 'Slowmode', desc: 'Slowmode delay in seconds' }),
    Object.freeze({ key: 'permission_overwrites', label: 'Permission Overwrites', desc: 'Channel-specific role and member permissions' }),
    Object.freeze({ key: 'available_tags', label: 'Available Tags', desc: 'Tags available in a forum or media channel' }),
    Object.freeze({ key: 'default_auto_archive_duration', label: 'Default Thread Archive', desc: 'Default thread archive duration in minutes' }),
    Object.freeze({ key: 'default_thread_rate_limit_per_user', label: 'Default Thread Slowmode', desc: 'Default thread slowmode in seconds' }),
    Object.freeze({ key: 'bitrate', label: 'Bitrate', desc: 'Voice channel bitrate' }),
    Object.freeze({ key: 'user_limit', label: 'User Limit', desc: 'Maximum number of voice channel members' })
  ]),
  guild: Object.freeze([
    Object.freeze({ key: 'id', label: 'Server ID', desc: 'Server snowflake ID' }),
    Object.freeze({ key: 'name', label: 'Server Name', desc: 'Server name' }),
    Object.freeze({ key: 'icon', label: 'Icon', desc: 'Server icon hash' }),
    Object.freeze({ key: 'features', label: 'Features', desc: 'Enabled server feature names' }),
    Object.freeze({ key: 'flags', label: 'Server Flags', desc: 'Bitfield of server flags' }),
    Object.freeze({ key: 'owner_id', label: 'Owner ID', desc: 'Server owner user ID' }),
    Object.freeze({ key: 'member_count', label: 'Member Count', desc: 'Number of members in server' }),
    Object.freeze({ key: 'description', label: 'Description', desc: 'Server description' }),
    Object.freeze({ key: 'verification_level', label: 'Verification Level', desc: 'Required verification level for members' }),
    Object.freeze({ key: 'default_message_notifications', label: 'Default Notifications', desc: 'Default notification setting for members' }),
    Object.freeze({ key: 'explicit_content_filter', label: 'Content Filter', desc: 'Explicit content filter level' }),
    Object.freeze({ key: 'mfa_level', label: 'MFA Level', desc: 'Multi-factor authentication requirement level' }),
    Object.freeze({ key: 'system_channel_id', label: 'System Channel ID', desc: 'ID of the system messages channel' }),
    Object.freeze({ key: 'rules_channel_id', label: 'Rules Channel ID', desc: 'ID of the rules or guidelines channel' }),
    Object.freeze({ key: 'public_updates_channel_id', label: 'Updates Channel ID', desc: 'ID of the community updates channel' }),
    Object.freeze({ key: 'preferred_locale', label: 'Preferred Locale', desc: 'Default language locale for the server' }),
    Object.freeze({ key: 'premium_tier', label: 'Boost Tier', desc: 'Server boost level' }),
    Object.freeze({ key: 'premium_subscription_count', label: 'Boost Count', desc: 'Number of server boosts' })
  ]),
  role: Object.freeze([
    Object.freeze({ key: 'id', label: 'Role ID', desc: 'Role snowflake ID' }),
    Object.freeze({ key: 'name', label: 'Role Name', desc: 'Role name' }),
    Object.freeze({ key: 'color', label: 'Color', desc: 'Integer color code' }),
    Object.freeze({ key: 'hoist', label: 'Is Hoisted', desc: 'Whether displayed separately in member list' }),
    Object.freeze({ key: 'position', label: 'Position', desc: 'Position in hierarchy' }),
    Object.freeze({ key: 'permissions', label: 'Permissions', desc: 'Bitwise permission string' }),
    Object.freeze({ key: 'mentionable', label: 'Is Mentionable', desc: 'Whether role is mentionable by everyone' }),
    Object.freeze({ key: 'flags', label: 'Role Flags', desc: 'Bitfield of role flags' }),
    Object.freeze({ key: 'unicode_emoji', label: 'Unicode Emoji', desc: 'Unicode emoji used as the role icon' })
  ]),
  interaction: Object.freeze([
    Object.freeze({ key: 'id', label: 'Interaction ID', desc: 'Unique interaction snowflake ID' }),
    Object.freeze({ key: 'token', label: 'Token', desc: 'Interaction response token' }),
    Object.freeze({ key: 'command_name', label: 'Command Name', desc: 'Invoked slash command name' }),
    Object.freeze({ key: 'custom_id', label: 'Custom ID', desc: 'Component custom ID' }),
    Object.freeze({ key: 'values', label: 'Selected Values', desc: 'Array of selected options' }),
    Object.freeze({ key: 'channel_id', label: 'Channel ID', desc: 'Channel ID where interaction occurred' }),
    Object.freeze({ key: 'guild_id', label: 'Server ID', desc: 'Server ID where interaction occurred' }),
    Object.freeze({ key: 'user', label: 'User', desc: 'Invoking user object' }),
    Object.freeze({ key: 'member', label: 'Member', desc: 'Invoking member object' })
  ]),
  emoji: Object.freeze([
    Object.freeze({ key: 'id', label: 'Emoji ID', desc: 'Custom emoji snowflake ID' }),
    Object.freeze({ key: 'name', label: 'Emoji Name', desc: 'Emoji name' }),
    Object.freeze({ key: 'animated', label: 'Is Animated', desc: 'Whether emoji is animated GIF' })
  ])
});
