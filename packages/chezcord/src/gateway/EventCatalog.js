import { GatewayIntents } from '../constants.js';

const event = (payloadType, intents = [], options = {}) => Object.freeze({
  payloadType,
  intents: Object.freeze(intents),
  ...options,
  ...(options.conditionalIntents ? { conditionalIntents: Object.freeze(options.conditionalIntents) } : {})
});

const intent = (name, label, privileged = false, applicationFlagBits = []) => Object.freeze({
  bit: GatewayIntents[name],
  label,
  privileged,
  ...(applicationFlagBits.length ? { applicationFlagBits: Object.freeze(applicationFlagBits) } : {})
});
//
export const GatewayIntentCatalog = Object.freeze({
  GUILDS: intent('GUILDS', 'Guilds'),
  GUILD_MEMBERS: Object.freeze({ bit: GatewayIntents.GUILD_MEMBERS, label: 'Guild members', privileged: true, applicationFlagBits: Object.freeze([14, 15]) }),
  GUILD_MODERATION: intent('GUILD_MODERATION', 'Server moderation'),
  GUILD_EXPRESSIONS: Object.freeze({ bit: GatewayIntents.GUILD_EXPRESSIONS, label: 'Server emojis and stickers', privileged: false }),
  GUILD_EMOJIS_AND_STICKERS: Object.freeze({ bit: GatewayIntents.GUILD_EMOJIS_AND_STICKERS, label: 'Server emojis and stickers', privileged: false, aliasOf: 'GUILD_EXPRESSIONS' }),
  GUILD_INTEGRATIONS: intent('GUILD_INTEGRATIONS', 'Integrations'),
  GUILD_WEBHOOKS: intent('GUILD_WEBHOOKS', 'Webhooks'),
  GUILD_INVITES: intent('GUILD_INVITES', 'Invites'),
  GUILD_VOICE_STATES: intent('GUILD_VOICE_STATES', 'Voice states'),
  GUILD_PRESENCES: Object.freeze({ bit: GatewayIntents.GUILD_PRESENCES, label: 'Presence updates', privileged: true, applicationFlagBits: Object.freeze([12, 13]) }),
  GUILD_MESSAGES: intent('GUILD_MESSAGES', 'Guild messages'),
  GUILD_MESSAGE_REACTIONS: intent('GUILD_MESSAGE_REACTIONS', 'Guild reactions'),
  GUILD_MESSAGE_TYPING: intent('GUILD_MESSAGE_TYPING', 'Guild typing'),
  DIRECT_MESSAGES: intent('DIRECT_MESSAGES', 'Direct messages'),
  DIRECT_MESSAGE_REACTIONS: intent('DIRECT_MESSAGE_REACTIONS', 'Direct message reactions'),
  DIRECT_MESSAGE_TYPING: intent('DIRECT_MESSAGE_TYPING', 'Direct message typing'),
  MESSAGE_CONTENT: Object.freeze({ bit: GatewayIntents.MESSAGE_CONTENT, label: 'Message content', privileged: true, applicationFlagBits: Object.freeze([18, 19]) }),
  GUILD_SCHEDULED_EVENTS: intent('GUILD_SCHEDULED_EVENTS', 'Scheduled events'),
  AUTO_MODERATION_CONFIGURATION: intent('AUTO_MODERATION_CONFIGURATION', 'AutoMod configuration'),
  AUTO_MODERATION_EXECUTION: intent('AUTO_MODERATION_EXECUTION', 'AutoMod actions'),
  GUILD_MESSAGE_POLLS: intent('GUILD_MESSAGE_POLLS', 'Guild message polls'),
  DIRECT_MESSAGE_POLLS: intent('DIRECT_MESSAGE_POLLS', 'Direct message polls')
});

export const GatewayEventCatalog = Object.freeze({
  READY: event('GatewayReadyPayload'),
  RESUMED: event('Record<string, never>'),
  APPLICATION_COMMAND_PERMISSIONS_UPDATE: event('GatewayDispatchPayloadMap["APPLICATION_COMMAND_PERMISSIONS_UPDATE"]'),
  AUTO_MODERATION_RULE_CREATE: event('GatewayDispatchPayloadMap["AUTO_MODERATION_RULE_CREATE"]', ['AUTO_MODERATION_CONFIGURATION']),
  AUTO_MODERATION_RULE_UPDATE: event('GatewayDispatchPayloadMap["AUTO_MODERATION_RULE_UPDATE"]', ['AUTO_MODERATION_CONFIGURATION']),
  AUTO_MODERATION_RULE_DELETE: event('GatewayDispatchPayloadMap["AUTO_MODERATION_RULE_DELETE"]', ['AUTO_MODERATION_CONFIGURATION']),
  MESSAGE_CREATE: event('GatewayMessagePayload', ['GUILD_MESSAGES', 'DIRECT_MESSAGES', 'MESSAGE_CONTENT'], { contentIntent: true }),
  MESSAGE_UPDATE: event('GatewayMessagePayload', ['GUILD_MESSAGES', 'DIRECT_MESSAGES', 'MESSAGE_CONTENT'], { contentIntent: true }),
  MESSAGE_DELETE: event('GatewayMessageDeletePayload', ['GUILD_MESSAGES', 'DIRECT_MESSAGES']),
  INTERACTION_CREATE: event('GatewayInteraction'),
  GUILD_CREATE: event('GatewayGuildPayload', ['GUILDS']),
  GUILD_UPDATE: event('GatewayGuildPayload', ['GUILDS']),
  GUILD_DELETE: event('GatewayGuildPayload', ['GUILDS']),
  GUILD_MEMBER_ADD: event('GatewayMemberAddPayload', ['GUILD_MEMBERS']),
  GUILD_MEMBER_REMOVE: event('GatewayMemberRemovePayload', ['GUILD_MEMBERS']),
  GUILD_MEMBER_UPDATE: event('GatewayMemberUpdatePayload', [], { conditionalIntents: ['GUILD_MEMBERS'] }),
  MESSAGE_REACTION_ADD: event('GatewayReactionPayload', ['GUILD_MESSAGE_REACTIONS', 'DIRECT_MESSAGE_REACTIONS']),
  MESSAGE_REACTION_REMOVE: event('GatewayReactionPayload', ['GUILD_MESSAGE_REACTIONS', 'DIRECT_MESSAGE_REACTIONS']),
  MESSAGE_REACTION_REMOVE_ALL: event('GatewayReactionRemoveAllPayload', ['GUILD_MESSAGE_REACTIONS', 'DIRECT_MESSAGE_REACTIONS']),
  MESSAGE_REACTION_REMOVE_EMOJI: event('GatewayReactionRemoveEmojiPayload', ['GUILD_MESSAGE_REACTIONS', 'DIRECT_MESSAGE_REACTIONS']),
  MESSAGE_DELETE_BULK: event('GatewayMessageDeleteBulkPayload', ['GUILD_MESSAGES']),
  CHANNEL_CREATE: event('DiscordChannel', ['GUILDS']),
  CHANNEL_UPDATE: event('DiscordChannel', ['GUILDS']),
  CHANNEL_DELETE: event('DiscordChannel', ['GUILDS']),
  CHANNEL_INFO: event('GatewayDispatchPayloadMap["CHANNEL_INFO"]'),
  GUILD_AUDIT_LOG_ENTRY_CREATE: event('GatewayDispatchPayloadMap["GUILD_AUDIT_LOG_ENTRY_CREATE"]', ['GUILD_MODERATION']),
  GUILD_EMOJIS_UPDATE: event('GatewayDispatchPayloadMap["GUILD_EMOJIS_UPDATE"]', ['GUILD_EXPRESSIONS']),
  GUILD_STICKERS_UPDATE: event('GatewayDispatchPayloadMap["GUILD_STICKERS_UPDATE"]', ['GUILD_EXPRESSIONS']),
  GUILD_INTEGRATIONS_UPDATE: event('GatewayDispatchPayloadMap["GUILD_INTEGRATIONS_UPDATE"]', ['GUILD_INTEGRATIONS']),
  INTEGRATION_CREATE: event('GatewayDispatchPayloadMap["INTEGRATION_CREATE"]', ['GUILD_INTEGRATIONS']),
  INTEGRATION_UPDATE: event('GatewayDispatchPayloadMap["INTEGRATION_UPDATE"]', ['GUILD_INTEGRATIONS']),
  INTEGRATION_DELETE: event('GatewayDispatchPayloadMap["INTEGRATION_DELETE"]', ['GUILD_INTEGRATIONS']),
  GUILD_MEMBERS_CHUNK: event('GatewayDispatchPayloadMap["GUILD_MEMBERS_CHUNK"]', [], { conditionalIntents: ['GUILD_MEMBERS'] }),
  GUILD_SCHEDULED_EVENT_USER_ADD: event('GatewayDispatchPayloadMap["GUILD_SCHEDULED_EVENT_USER_ADD"]', ['GUILD_SCHEDULED_EVENTS']),
  GUILD_SCHEDULED_EVENT_USER_REMOVE: event('GatewayDispatchPayloadMap["GUILD_SCHEDULED_EVENT_USER_REMOVE"]', ['GUILD_SCHEDULED_EVENTS']),
  GUILD_SOUNDBOARD_SOUND_CREATE: event('GatewayDispatchPayloadMap["GUILD_SOUNDBOARD_SOUND_CREATE"]', ['GUILD_EXPRESSIONS']),
  GUILD_SOUNDBOARD_SOUND_UPDATE: event('GatewayDispatchPayloadMap["GUILD_SOUNDBOARD_SOUND_UPDATE"]', ['GUILD_EXPRESSIONS']),
  GUILD_SOUNDBOARD_SOUND_DELETE: event('GatewayDispatchPayloadMap["GUILD_SOUNDBOARD_SOUND_DELETE"]', ['GUILD_EXPRESSIONS']),
  GUILD_SOUNDBOARD_SOUNDS_UPDATE: event('GatewayDispatchPayloadMap["GUILD_SOUNDBOARD_SOUNDS_UPDATE"]', ['GUILD_EXPRESSIONS']),
  ENTITLEMENT_CREATE: event('GatewayDispatchPayloadMap["ENTITLEMENT_CREATE"]'),
  ENTITLEMENT_UPDATE: event('GatewayDispatchPayloadMap["ENTITLEMENT_UPDATE"]'),
  ENTITLEMENT_DELETE: event('GatewayDispatchPayloadMap["ENTITLEMENT_DELETE"]'),
  VOICE_STATE_UPDATE: event('GatewayVoiceStatePayload', ['GUILD_VOICE_STATES']),
  PRESENCE_UPDATE: event('GatewayPresencePayload', ['GUILD_PRESENCES']),
  GUILD_BAN_ADD: event('GatewayDispatchPayloadMap["GUILD_BAN_ADD"]', ['GUILD_MODERATION']),
  GUILD_BAN_REMOVE: event('GatewayDispatchPayloadMap["GUILD_BAN_REMOVE"]', ['GUILD_MODERATION']),
  GUILD_SCHEDULED_EVENT_CREATE: event('GatewayDispatchPayloadMap["GUILD_SCHEDULED_EVENT_CREATE"]', ['GUILD_SCHEDULED_EVENTS']),
  GUILD_SCHEDULED_EVENT_UPDATE: event('GatewayDispatchPayloadMap["GUILD_SCHEDULED_EVENT_UPDATE"]', ['GUILD_SCHEDULED_EVENTS']),
  GUILD_SCHEDULED_EVENT_DELETE: event('GatewayDispatchPayloadMap["GUILD_SCHEDULED_EVENT_DELETE"]', ['GUILD_SCHEDULED_EVENTS']),
  AUTO_MODERATION_ACTION_EXECUTION: event('GatewayDispatchPayloadMap["AUTO_MODERATION_ACTION_EXECUTION"]', ['AUTO_MODERATION_EXECUTION']),
  GUILD_ROLE_CREATE: event('GatewayDispatchPayloadMap["GUILD_ROLE_CREATE"]', ['GUILDS']),
  GUILD_ROLE_UPDATE: event('GatewayDispatchPayloadMap["GUILD_ROLE_UPDATE"]', ['GUILDS']),
  GUILD_ROLE_DELETE: event('GatewayDispatchPayloadMap["GUILD_ROLE_DELETE"]', ['GUILDS']),
  THREAD_CREATE: event('DiscordChannel', ['GUILDS']),
  THREAD_UPDATE: event('DiscordChannel', ['GUILDS']),
  THREAD_DELETE: event('DiscordChannel', ['GUILDS']),
  THREAD_LIST_SYNC: event('GatewayDispatchPayloadMap["THREAD_LIST_SYNC"]', ['GUILDS']),
  THREAD_MEMBER_UPDATE: event('GatewayDispatchPayloadMap["THREAD_MEMBER_UPDATE"]', ['GUILDS']),
  THREAD_MEMBERS_UPDATE: event('GatewayDispatchPayloadMap["THREAD_MEMBERS_UPDATE"]', ['GUILDS'], { conditionalIntents: ['GUILD_MEMBERS'] }),
  TYPING_START: event('GatewayTypingPayload', ['GUILD_MESSAGE_TYPING', 'DIRECT_MESSAGE_TYPING']),
  CHANNEL_PINS_UPDATE: event('GatewayChannelPinsPayload', ['GUILDS', 'DIRECT_MESSAGES']),
  USER_UPDATE: event('DiscordUser'),
  INVITE_CREATE: event('GatewayDispatchPayloadMap["INVITE_CREATE"]', ['GUILD_INVITES']),
  INVITE_DELETE: event('GatewayDispatchPayloadMap["INVITE_DELETE"]', ['GUILD_INVITES']),
  WEBHOOKS_UPDATE: event('GatewayDispatchPayloadMap["WEBHOOKS_UPDATE"]', ['GUILD_WEBHOOKS']),
  STAGE_INSTANCE_CREATE: event('GatewayDispatchPayloadMap["STAGE_INSTANCE_CREATE"]', ['GUILDS']),
  STAGE_INSTANCE_UPDATE: event('GatewayDispatchPayloadMap["STAGE_INSTANCE_UPDATE"]', ['GUILDS']),
  STAGE_INSTANCE_DELETE: event('GatewayDispatchPayloadMap["STAGE_INSTANCE_DELETE"]', ['GUILDS']),
  VOICE_CHANNEL_EFFECT_SEND: event('GatewayDispatchPayloadMap["VOICE_CHANNEL_EFFECT_SEND"]', ['GUILD_VOICE_STATES']),
  VOICE_SERVER_UPDATE: event('GatewayDispatchPayloadMap["VOICE_SERVER_UPDATE"]'),
  VOICE_CHANNEL_STATUS_UPDATE: event('GatewayDispatchPayloadMap["VOICE_CHANNEL_STATUS_UPDATE"]', ['GUILDS']),
  VOICE_CHANNEL_START_TIME_UPDATE: event('GatewayDispatchPayloadMap["VOICE_CHANNEL_START_TIME_UPDATE"]', ['GUILDS']),
  MESSAGE_POLL_VOTE_ADD: event('GatewayDispatchPayloadMap["MESSAGE_POLL_VOTE_ADD"]', ['GUILD_MESSAGE_POLLS', 'DIRECT_MESSAGE_POLLS']),
  MESSAGE_POLL_VOTE_REMOVE: event('GatewayDispatchPayloadMap["MESSAGE_POLL_VOTE_REMOVE"]', ['GUILD_MESSAGE_POLLS', 'DIRECT_MESSAGE_POLLS']),
  SUBSCRIPTION_CREATE: event('GatewayDispatchPayloadMap["SUBSCRIPTION_CREATE"]'),
  SUBSCRIPTION_UPDATE: event('GatewayDispatchPayloadMap["SUBSCRIPTION_UPDATE"]'),
  SUBSCRIPTION_DELETE: event('GatewayDispatchPayloadMap["SUBSCRIPTION_DELETE"]')
});

export function getGatewayEventMetadata(eventName) {
  return GatewayEventCatalog[String(eventName || '')] || null;
}

export function normalizeGatewayIntentName(intentName) {
  const name = String(intentName || '');
  return GatewayIntentCatalog[name]?.aliasOf || name;
}
