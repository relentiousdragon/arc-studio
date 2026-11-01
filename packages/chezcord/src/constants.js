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
  CHANNEL_OBFUSCATED: 1 << 17
});

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
  avatar: (userId, avatarHash, format = 'png', size = 512) =>
    avatarHash
      ? `${CDN_BASE}/avatars/${userId}/${avatarHash}.${avatarHash.startsWith('a_') ? 'gif' : format}?size=${size}`
      : `${CDN_BASE}/embed/avatars/${Number(BigInt(userId) >> 22n) % 6}.png`,
  banner: (userId, bannerHash, format = 'png', size = 1024) =>
    bannerHash ? `${CDN_BASE}/banners/${userId}/${bannerHash}.${bannerHash.startsWith('a_') ? 'gif' : format}?size=${size}` : null,
  guildIcon: (guildId, iconHash, format = 'png', size = 512) =>
    iconHash ? `${CDN_BASE}/icons/${guildId}/${iconHash}.${iconHash.startsWith('a_') ? 'gif' : format}?size=${size}` : null,
  customEmoji: (emojiId, animated = false, size = 128) =>
    `${CDN_BASE}/emojis/${emojiId}.${animated ? 'gif' : 'png'}?size=${size}`
});
