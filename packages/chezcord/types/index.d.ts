export type Snowflake = string;
export type MaybePromise<T> = T | Promise<T>;
export type JSONEncodable<T> = T | { toJSON(): T };
//
export interface DiscordUser {
  id: Snowflake;
  username: string;
  global_name?: string | null;
  discriminator?: string;
  avatar?: string | null;
  bot?: boolean;
  [key: string]: unknown;
}

export interface DiscordMessage {
  id: Snowflake;
  channel_id: Snowflake;
  guild_id?: Snowflake;
  content?: string;
  timestamp?: string;
  edited_timestamp?: string | null;
  tts?: boolean;
  mention_everyone?: boolean;
  mentions?: DiscordUser[];
  attachments?: DiscordAttachment[];
  embeds?: EmbedData[];
  pinned?: boolean;
  type?: number;
  flags?: number;
  components?: ComponentData[];
  author?: DiscordUser;
  [key: string]: unknown;
}

export interface DiscordAttachment {
  id: Snowflake;
  filename: string;
  description?: string | null;
  content_type?: string | null;
  size?: number;
  url?: string;
  proxy_url?: string;
  width?: number | null;
  height?: number | null;
  ephemeral?: boolean;
  [key: string]: unknown;
}

export interface MessagePayload {
  content?: string;
  embeds?: Array<JSONEncodable<EmbedData>>;
  components?: Array<JSONEncodable<ComponentData>>;
  files?: AttachmentInput[];
  attachments?: unknown[];
  flags?: number;
  allowed_mentions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EmbedData {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: { text: string; icon_url?: string };
  image?: { url: string };
  thumbnail?: { url: string };
  author?: { name: string; url?: string; icon_url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  [key: string]: unknown;
}

export interface AttachmentInput {
  data: string;
  filename?: string;
  name?: string;
  contentType?: string;
  description?: string;
  isSpoiler?: boolean;
}

export interface ComponentData {
  type: number;
  [key: string]: unknown;
}

export interface DiscordMember {
  user?: DiscordUser;
  nick?: string | null;
  roles?: Snowflake[];
  joined_at?: string | null;
  [key: string]: unknown;
}

export interface DiscordChannel {
  id: Snowflake;
  type: number;
  guild_id?: Snowflake;
  name?: string | null;
  parent_id?: Snowflake | null;
  position?: number;
  [key: string]: unknown;
}

export interface DiscordRole {
  id: Snowflake;
  name: string;
  color?: number;
  hoist?: boolean;
  position?: number;
  permissions?: string;
  managed?: boolean;
  mentionable?: boolean;
  [key: string]: unknown;
}

export interface DiscordEmoji {
  id?: Snowflake | null;
  name?: string | null;
  animated?: boolean;
  [key: string]: unknown;
}

export interface InteractionReplyOptions extends MessagePayload {
  ephemeral?: boolean;
}

export interface InteractionDeferOptions {
  ephemeral?: boolean;
}

export interface GatewayInteractionData {
  id?: Snowflake;
  name?: string;
  type?: number;
  options?: Array<Record<string, unknown>>;
  resolved?: Record<string, unknown>;
  custom_id?: string;
  component_type?: number;
  values?: string[];
  target_id?: Snowflake;
  [key: string]: unknown;
}

export interface GatewayInteraction {
  id: Snowflake;
  application_id: Snowflake;
  type: number;
  token: string;
  version?: number;
  guild_id?: Snowflake;
  channel_id?: Snowflake;
  channel?: Record<string, unknown>;
  data?: GatewayInteractionData;
  user?: DiscordUser;
  member?: DiscordMember;
  message?: DiscordMessage;
  locale?: string;
  guild_locale?: string;
  app_permissions?: string;
  entitlements?: unknown[];
  [key: string]: unknown;
}

export interface Interaction extends GatewayInteraction {
  readonly deferred: boolean;
  readonly replied: boolean;
  reply(content: string | InteractionReplyOptions, options?: InteractionDeferOptions): Promise<unknown>;
  deferReply(options?: InteractionDeferOptions): Promise<unknown>;
  deferUpdate(): Promise<unknown>;
  editReply(content: string | MessagePayload): Promise<unknown>;
}

export interface GatewayReadyPayload {
  v: number;
  user: DiscordUser;
  guilds: Array<Record<string, unknown>>;
  session_id: string;
  resume_gateway_url: string;
  [key: string]: unknown;
}

export interface GatewayMessagePayload extends DiscordMessage {}
export interface GatewayGuildPayload {
  id: Snowflake;
  name?: string;
  [key: string]: unknown;
}
export interface GatewayMemberAddPayload {
  guild_id: Snowflake;
  user: DiscordUser;
  roles?: Snowflake[];
  joined_at?: string;
  deaf?: boolean;
  mute?: boolean;
  [key: string]: unknown;
}
export interface GatewayMemberRemovePayload {
  guild_id: Snowflake;
  user: DiscordUser;
}
export interface GatewayMemberUpdatePayload {
  guild_id: Snowflake;
  user: DiscordUser;
  roles?: Snowflake[];
  nick?: string | null;
  avatar?: string | null;
  joined_at?: string;
  premium_since?: string | null;
  deaf?: boolean;
  mute?: boolean;
  pending?: boolean;
  communication_disabled_until?: string | null;
  [key: string]: unknown;
}
export interface GatewayReactionPayload {
  user_id: Snowflake;
  channel_id: Snowflake;
  message_id: Snowflake;
  guild_id?: Snowflake;
  member?: DiscordMember;
  emoji: DiscordEmoji;
  [key: string]: unknown;
}
export interface GatewayVoiceStatePayload {
  guild_id?: Snowflake;
  channel_id: Snowflake | null;
  user_id: Snowflake;
  member?: DiscordMember;
  session_id: string;
  deaf?: boolean;
  mute?: boolean;
  self_deaf?: boolean;
  self_mute?: boolean;
  self_stream?: boolean;
  self_video?: boolean;
  suppress?: boolean;
  request_to_speak_timestamp?: string | null;
  [key: string]: unknown;
}
export interface GatewayPresencePayload {
  user: DiscordUser;
  guild_id: Snowflake;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  activities: Array<Record<string, unknown>>;
  client_status?: Record<string, string>;
  roles?: Snowflake[];
  [key: string]: unknown;
}
export interface GatewayTypingPayload {
  channel_id: Snowflake;
  guild_id?: Snowflake;
  user_id: Snowflake;
  timestamp: number;
  member?: DiscordMember;
}
export interface GatewayMessageDeletePayload {
  id: Snowflake;
  channel_id: Snowflake;
  guild_id?: Snowflake;
}
export interface GatewayMessageDeleteBulkPayload {
  ids: Snowflake[];
  channel_id: Snowflake;
  guild_id?: Snowflake;
}
export interface GatewayReactionRemoveAllPayload {
  channel_id: Snowflake;
  message_id: Snowflake;
  guild_id?: Snowflake;
}
export interface GatewayReactionRemoveEmojiPayload extends GatewayReactionRemoveAllPayload {
  emoji: DiscordEmoji;
}
export interface GatewayChannelPinsPayload {
  channel_id: Snowflake;
  guild_id?: Snowflake;
  last_pin_timestamp?: string | null;
}
export interface GatewayDispatchPayloadMap {
  READY: GatewayReadyPayload;
  RESUMED: Record<string, never>;
  APPLICATION_COMMAND_PERMISSIONS_UPDATE: Record<string, unknown>;
  AUTO_MODERATION_RULE_CREATE: Record<string, unknown>;
  AUTO_MODERATION_RULE_UPDATE: Record<string, unknown>;
  AUTO_MODERATION_RULE_DELETE: Record<string, unknown>;
  MESSAGE_CREATE: GatewayMessagePayload;
  MESSAGE_UPDATE: Partial<GatewayMessagePayload> & Pick<GatewayMessagePayload, 'id' | 'channel_id'>;
  MESSAGE_DELETE: GatewayMessageDeletePayload;
  INTERACTION_CREATE: GatewayInteraction;
  GUILD_CREATE: GatewayGuildPayload;
  GUILD_UPDATE: GatewayGuildPayload;
  GUILD_DELETE: GatewayGuildPayload & { unavailable?: boolean };
  GUILD_MEMBER_ADD: GatewayMemberAddPayload;
  GUILD_MEMBER_REMOVE: GatewayMemberRemovePayload;
  GUILD_MEMBER_UPDATE: GatewayMemberUpdatePayload;
  MESSAGE_REACTION_ADD: GatewayReactionPayload;
  MESSAGE_REACTION_REMOVE: GatewayReactionPayload;
  MESSAGE_REACTION_REMOVE_ALL: GatewayReactionRemoveAllPayload;
  MESSAGE_REACTION_REMOVE_EMOJI: GatewayReactionRemoveEmojiPayload;
  MESSAGE_DELETE_BULK: GatewayMessageDeleteBulkPayload;
  CHANNEL_CREATE: DiscordChannel;
  CHANNEL_UPDATE: DiscordChannel;
  CHANNEL_DELETE: DiscordChannel;
  CHANNEL_INFO: Record<string, unknown>;
  GUILD_AUDIT_LOG_ENTRY_CREATE: Record<string, unknown>;
  GUILD_EMOJIS_UPDATE: { guild_id: Snowflake; emojis: DiscordEmoji[] };
  GUILD_STICKERS_UPDATE: { guild_id: Snowflake; stickers: Array<Record<string, unknown>> };
  GUILD_INTEGRATIONS_UPDATE: { guild_id: Snowflake };
  INTEGRATION_CREATE: Record<string, unknown>;
  INTEGRATION_UPDATE: Record<string, unknown>;
  INTEGRATION_DELETE: Record<string, unknown>;
  GUILD_MEMBERS_CHUNK: { guild_id: Snowflake; members: DiscordMember[]; chunk_index: number; chunk_count: number; not_found?: Snowflake[]; presences?: GatewayPresencePayload[]; nonce?: string };
  GUILD_SCHEDULED_EVENT_USER_ADD: Record<string, unknown>;
  GUILD_SCHEDULED_EVENT_USER_REMOVE: Record<string, unknown>;
  GUILD_SOUNDBOARD_SOUND_CREATE: Record<string, unknown>;
  GUILD_SOUNDBOARD_SOUND_UPDATE: Record<string, unknown>;
  GUILD_SOUNDBOARD_SOUND_DELETE: Record<string, unknown>;
  GUILD_SOUNDBOARD_SOUNDS_UPDATE: Record<string, unknown>;
  ENTITLEMENT_CREATE: Record<string, unknown>;
  ENTITLEMENT_UPDATE: Record<string, unknown>;
  ENTITLEMENT_DELETE: Record<string, unknown>;
  VOICE_STATE_UPDATE: GatewayVoiceStatePayload;
  PRESENCE_UPDATE: GatewayPresencePayload;
  GUILD_BAN_ADD: { guild_id: Snowflake; user: DiscordUser };
  GUILD_BAN_REMOVE: { guild_id: Snowflake; user: DiscordUser };
  GUILD_SCHEDULED_EVENT_CREATE: Record<string, unknown>;
  GUILD_SCHEDULED_EVENT_UPDATE: Record<string, unknown>;
  GUILD_SCHEDULED_EVENT_DELETE: Record<string, unknown>;
  AUTO_MODERATION_ACTION_EXECUTION: Record<string, unknown>;
  GUILD_ROLE_CREATE: { guild_id: Snowflake; role: DiscordRole };
  GUILD_ROLE_UPDATE: { guild_id: Snowflake; role: DiscordRole };
  GUILD_ROLE_DELETE: { guild_id: Snowflake; role_id: Snowflake };
  THREAD_CREATE: DiscordChannel;
  THREAD_UPDATE: DiscordChannel;
  THREAD_DELETE: DiscordChannel;
  THREAD_LIST_SYNC: Record<string, unknown>;
  THREAD_MEMBER_UPDATE: { id: Snowflake; user_id?: Snowflake; join_timestamp: string; flags: number; member?: DiscordMember };
  THREAD_MEMBERS_UPDATE: { id: Snowflake; guild_id: Snowflake; member_count: number; added_members?: Array<Record<string, unknown>>; removed_member_ids?: Snowflake[] };
  TYPING_START: GatewayTypingPayload;
  CHANNEL_PINS_UPDATE: GatewayChannelPinsPayload;
  USER_UPDATE: DiscordUser;
  INVITE_CREATE: Record<string, unknown>;
  INVITE_DELETE: Record<string, unknown>;
  WEBHOOKS_UPDATE: Record<string, unknown>;
  STAGE_INSTANCE_CREATE: Record<string, unknown>;
  STAGE_INSTANCE_UPDATE: Record<string, unknown>;
  STAGE_INSTANCE_DELETE: Record<string, unknown>;
  VOICE_CHANNEL_EFFECT_SEND: Record<string, unknown>;
  VOICE_SERVER_UPDATE: Record<string, unknown>;
  VOICE_CHANNEL_STATUS_UPDATE: Record<string, unknown>;
  VOICE_CHANNEL_START_TIME_UPDATE: Record<string, unknown>;
  MESSAGE_POLL_VOTE_ADD: Record<string, unknown>;
  MESSAGE_POLL_VOTE_REMOVE: Record<string, unknown>;
  SUBSCRIPTION_CREATE: Record<string, unknown>;
  SUBSCRIPTION_UPDATE: Record<string, unknown>;
  SUBSCRIPTION_DELETE: Record<string, unknown>;
}

export interface GatewayDiagnostics {
  shardId: number;
  status: ShardStatusValue;
  reconnectAttempts: number;
  lastCloseCode: number | null;
  lastCloseReason: string;
  heartbeatLatencyMs: number | null;
  sessionResumed: boolean | null;
  resumeCount: number;
  hasResumableSession: boolean;
}

export interface GatewayPresence {
  since?: number | null;
  activities?: Array<Record<string, unknown>>;
  status?: 'online' | 'idle' | 'dnd' | 'invisible' | 'offline';
  afk?: boolean;
}

export type GatewayIntentName =
  | 'GUILDS'
  | 'GUILD_MEMBERS'
  | 'GUILD_MODERATION'
  | 'GUILD_EMOJIS_AND_STICKERS'
  | 'GUILD_EXPRESSIONS'
  | 'GUILD_INTEGRATIONS'
  | 'GUILD_WEBHOOKS'
  | 'GUILD_INVITES'
  | 'GUILD_VOICE_STATES'
  | 'GUILD_PRESENCES'
  | 'GUILD_MESSAGES'
  | 'GUILD_MESSAGE_REACTIONS'
  | 'GUILD_MESSAGE_TYPING'
  | 'DIRECT_MESSAGES'
  | 'DIRECT_MESSAGE_REACTIONS'
  | 'DIRECT_MESSAGE_TYPING'
  | 'MESSAGE_CONTENT'
  | 'GUILD_SCHEDULED_EVENTS'
  | 'AUTO_MODERATION_CONFIGURATION'
  | 'AUTO_MODERATION_EXECUTION'
  | 'GUILD_MESSAGE_POLLS'
  | 'DIRECT_MESSAGE_POLLS';
export type PermissionFlagName =
  | 'CREATE_INSTANT_INVITE' | 'KICK_MEMBERS' | 'BAN_MEMBERS' | 'ADMINISTRATOR' | 'MANAGE_CHANNELS' | 'MANAGE_GUILD'
  | 'ADD_REACTIONS' | 'VIEW_AUDIT_LOG' | 'PRIORITY_SPEAKER' | 'STREAM' | 'VIEW_CHANNEL' | 'SEND_MESSAGES'
  | 'SEND_TTS_MESSAGES' | 'MANAGE_MESSAGES' | 'EMBED_LINKS' | 'ATTACH_FILES' | 'READ_MESSAGE_HISTORY'
  | 'MENTION_EVERYONE' | 'USE_EXTERNAL_EMOJIS' | 'VIEW_GUILD_INSIGHTS' | 'CONNECT' | 'SPEAK' | 'MUTE_MEMBERS'
  | 'DEAFEN_MEMBERS' | 'MOVE_MEMBERS' | 'USE_VAD' | 'CHANGE_NICKNAME' | 'MANAGE_NICKNAMES' | 'MANAGE_ROLES'
  | 'MANAGE_WEBHOOKS' | 'MANAGE_GUILD_EXPRESSIONS' | 'USE_APPLICATION_COMMANDS' | 'REQUEST_TO_SPEAK'
  | 'MANAGE_EVENTS' | 'MANAGE_THREADS' | 'CREATE_PUBLIC_THREADS' | 'CREATE_PRIVATE_THREADS' | 'USE_EXTERNAL_STICKERS'
  | 'SEND_MESSAGES_IN_THREADS' | 'USE_EMBEDDED_ACTIVITIES' | 'MODERATE_MEMBERS'
  | 'VIEW_CREATOR_MONETIZATION_ANALYTICS' | 'USE_SOUNDBOARD' | 'CREATE_GUILD_EXPRESSIONS' | 'CREATE_EVENTS'
  | 'USE_EXTERNAL_SOUNDS' | 'SEND_VOICE_MESSAGES' | 'SET_VOICE_CHANNEL_STATUS' | 'SEND_POLLS' | 'USE_EXTERNAL_APPS'
  | 'PIN_MESSAGES' | 'BYPASS_SLOWMODE';
export type ShardStatusValue = 'DISCONNECTED' | 'CONNECTING' | 'HANDSHAKING' | 'IDENTIFYING' | 'RESUMING' | 'READY';
export type GatewayEventName = keyof GatewayDispatchPayloadMap;
export type CollectorEndReason = 'time' | 'limit' | 'manual';

export interface GatewayEventMetadata {
  payloadType: string;
  intents: readonly GatewayIntentName[];
  contentIntent?: boolean;
  conditionalIntents?: readonly GatewayIntentName[];
}

export interface GatewayIntentMetadata {
  bit: number;
  label: string;
  privileged: boolean;
  applicationFlagBits?: readonly number[];
  aliasOf?: GatewayIntentName;
}

export const GatewayEventCatalog: Readonly<Record<GatewayEventName, GatewayEventMetadata>>;
export const GatewayIntentCatalog: Readonly<Record<GatewayIntentName, GatewayIntentMetadata>>;
export function getGatewayEventMetadata(eventName: string): GatewayEventMetadata | null;
export function normalizeGatewayIntentName(intentName: string): string;

export interface ClientOptions {
  token?: string;
  intents?: number;
  capabilities?: number;
}

export interface ClientEvents {
  status: [status: ShardStatusValue];
  heartbeatLatency: [latencyMs: number];
  gatewayDiagnostics: [diagnostics: GatewayDiagnostics];
  gatewayDispatch: [eventName: GatewayEventName, payload: GatewayDispatchPayloadMap[GatewayEventName]];
  debug: [message: string];
  error: [error: Error];
  fatalError: [error: Error];
  ready: [client: Client];
  destroy: [];
  messageCreate: [message: GatewayMessagePayload];
  interactionCreate: [interaction: Interaction];
  guildCreate: [guild: GatewayGuildPayload];
  GUILD_CREATE: [guild: GatewayGuildPayload];
  guildMemberAdd: [member: GatewayMemberAddPayload];
  MESSAGE_UPDATE: [payload: GatewayDispatchPayloadMap['MESSAGE_UPDATE']];
  MESSAGE_DELETE: [payload: GatewayDispatchPayloadMap['MESSAGE_DELETE']];
  MESSAGE_REACTION_ADD: [payload: GatewayReactionPayload];
  MESSAGE_REACTION_REMOVE: [payload: GatewayReactionPayload];
  CHANNEL_CREATE: [payload: DiscordChannel];
  CHANNEL_UPDATE: [payload: DiscordChannel];
  CHANNEL_DELETE: [payload: DiscordChannel];
  GUILD_MEMBER_REMOVE: [payload: GatewayDispatchPayloadMap['GUILD_MEMBER_REMOVE']];
  VOICE_STATE_UPDATE: [payload: GatewayVoiceStatePayload];
  PRESENCE_UPDATE: [payload: GatewayPresencePayload];
  GUILD_BAN_ADD: [payload: GatewayDispatchPayloadMap['GUILD_BAN_ADD']];
  GUILD_BAN_REMOVE: [payload: GatewayDispatchPayloadMap['GUILD_BAN_REMOVE']];
  GUILD_SCHEDULED_EVENT_CREATE: [payload: GatewayDispatchPayloadMap['GUILD_SCHEDULED_EVENT_CREATE']];
  GUILD_SCHEDULED_EVENT_UPDATE: [payload: GatewayDispatchPayloadMap['GUILD_SCHEDULED_EVENT_UPDATE']];
  GUILD_SCHEDULED_EVENT_DELETE: [payload: GatewayDispatchPayloadMap['GUILD_SCHEDULED_EVENT_DELETE']];
  AUTO_MODERATION_ACTION_EXECUTION: [payload: GatewayDispatchPayloadMap['AUTO_MODERATION_ACTION_EXECUTION']];
  GUILD_UPDATE: [payload: GatewayGuildPayload];
  GUILD_DELETE: [payload: GatewayGuildPayload & { unavailable?: boolean }];
  GUILD_ROLE_CREATE: [payload: GatewayDispatchPayloadMap['GUILD_ROLE_CREATE']];
  GUILD_ROLE_UPDATE: [payload: GatewayDispatchPayloadMap['GUILD_ROLE_UPDATE']];
  GUILD_ROLE_DELETE: [payload: GatewayDispatchPayloadMap['GUILD_ROLE_DELETE']];
  THREAD_CREATE: [payload: GatewayDispatchPayloadMap['THREAD_CREATE']];
  THREAD_UPDATE: [payload: GatewayDispatchPayloadMap['THREAD_UPDATE']];
  THREAD_DELETE: [payload: GatewayDispatchPayloadMap['THREAD_DELETE']];
  TYPING_START: [payload: GatewayTypingPayload];
  CHANNEL_PINS_UPDATE: [payload: GatewayDispatchPayloadMap['CHANNEL_PINS_UPDATE']];
  MESSAGE_REACTION_REMOVE_ALL: [payload: GatewayDispatchPayloadMap['MESSAGE_REACTION_REMOVE_ALL']];
  INVITE_CREATE: [payload: GatewayDispatchPayloadMap['INVITE_CREATE']];
  INVITE_DELETE: [payload: GatewayDispatchPayloadMap['INVITE_DELETE']];
}

export class Client {
  constructor(options?: ClientOptions);
  token: string | null;
  intents: number;
  capabilities: number;
  rest: RESTClient;
  ws: GatewayShard | null;
  user: DiscordUser | null;
  readyAt: Date | null;
  presence: GatewayPresence;
  login(token?: string): Promise<this>;
  disposeGateway(): void;
  destroy(): void;
  getGatewayDiagnostics(): GatewayDiagnostics;
  setPresence(presence: GatewayPresence): void;
  setVoiceChannel(guildId: Snowflake, channelId: Snowflake | null, options?: { selfMute?: boolean; selfDeaf?: boolean }): void;
  sendMessage(channelId: Snowflake, contentOrPayload: string | MessagePayload): Promise<DiscordMessage | unknown>;
  editMessage(channelId: Snowflake, messageId: Snowflake, contentOrPayload: string | MessagePayload): Promise<DiscordMessage | unknown>;
  replyInteraction(interactionId: Snowflake, interactionToken: string, responseData: string | MessagePayload): Promise<unknown>;
  createInteractionCollector(filter?: (interaction: Interaction) => MaybePromise<boolean>, options?: CollectorOptions): InteractionCollector;
  awaitInteraction(filter?: (interaction: Interaction) => MaybePromise<boolean>, options?: CollectorOptions & { onFilterFailed?: (interaction: Interaction) => void }): Promise<Interaction | null>;
  createMessageCollector(filter?: (message: GatewayMessagePayload) => MaybePromise<boolean>, options?: CollectorOptions): MessageCollector;
  awaitMessage(filter?: (message: GatewayMessagePayload) => MaybePromise<boolean>, options?: CollectorOptions & { onFilterFailed?: (message: GatewayMessagePayload) => void }): Promise<GatewayMessagePayload | null>;
  on<K extends keyof ClientEvents>(event: K, listener: (...args: ClientEvents[K]) => void): this;
  once<K extends keyof ClientEvents>(event: K, listener: (...args: ClientEvents[K]) => void): this;
  off<K extends keyof ClientEvents>(event: K, listener: (...args: ClientEvents[K]) => void): this;
  emit<K extends keyof ClientEvents>(event: K, ...args: ClientEvents[K]): boolean;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
  off(event: string | symbol, listener: (...args: any[]) => void): this;
  emit(event: string | symbol, ...args: any[]): boolean;
  removeAllListeners(event?: string | symbol): this;
}

export interface CollectorOptions {
  timeout?: number;
  max?: number;
}

export class InteractionCollector extends EventEmitterLike<Interaction> {
  constructor(client: Client, filter?: (interaction: Interaction) => MaybePromise<boolean>, options?: CollectorOptions);
}
export class MessageCollector extends EventEmitterLike<GatewayMessagePayload> {
  constructor(client: Client, filter?: (message: GatewayMessagePayload) => MaybePromise<boolean>, options?: CollectorOptions);
}
declare class EventEmitterLike<T> {
  client: Client;
  filter: (value: T) => MaybePromise<boolean>;
  timeout: number;
  max: number;
  collected: T[];
  ended: boolean;
  stop(reason?: CollectorEndReason): void;
  on(event: 'collect', listener: (value: T) => void): this;
  on(event: 'filterFailed', listener: (value: T) => void): this;
  on(event: 'end', listener: (values: T[], reason: CollectorEndReason) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  once(event: 'collect', listener: (value: T) => void): this;
  once(event: 'end', listener: (values: T[], reason: CollectorEndReason) => void): this;
}

export interface GatewayShardOptions {
  token: string;
  intents?: number;
  capabilities?: number;
  shardId?: number;
  totalShards?: number;
}

export class GatewayShard {
  constructor(options: GatewayShardOptions);
  token: string;
  intents: number;
  capabilities: number;
  shardId: number;
  totalShards: number;
  status: ShardStatusValue;
  connect(): void;
  handleMessage(payload: Record<string, unknown>): void;
  handleDispatch(eventName: string, data: unknown): void;
  updatePresence(presence: GatewayPresence): void;
  send(opcode: number, data: unknown): void;
  closeAndReconnect(code?: number, resume?: boolean): void;
  getDiagnostics(): GatewayDiagnostics;
  destroy(): void;
  on(event: string, listener: (...args: any[]) => void): this;
  once(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
}

export const ShardStatus: Readonly<Record<ShardStatusValue, ShardStatusValue>>;
export class RESTClient {
  constructor(options?: { token?: string; apiBase?: string });
  token: string | null;
  apiBase: string;
  setToken(token: string | null): this;
  request<T = unknown>(method: string, endpoint: string, options?: RequestOptions): Promise<T>;
  getCurrentUser<T = DiscordUser>(): Promise<T>;
  getCurrentApplication<T = Record<string, unknown>>(): Promise<T>;
  getGlobalApplicationCommands<T = unknown[]>(applicationId: Snowflake): Promise<T>;
  getGuildApplicationCommands<T = unknown[]>(applicationId: Snowflake, guildId: Snowflake): Promise<T>;
  bulkOverwriteGlobalApplicationCommands<T = unknown[]>(applicationId: Snowflake, commands: ApplicationCommand[], currentCommands?: ApplicationCommand[] | null): Promise<T>;
  bulkOverwriteGuildApplicationCommands<T = unknown[]>(applicationId: Snowflake, guildId: Snowflake, commands: ApplicationCommand[], currentCommands?: ApplicationCommand[] | null): Promise<T>;
  bulkOverwriteApplicationCommands<T = unknown[]>(applicationId: Snowflake, guildId: Snowflake, commands: ApplicationCommand[], currentCommands?: ApplicationCommand[] | null): Promise<T>;
  modifyCurrentUser<T = DiscordUser>(data: Record<string, unknown>): Promise<T>;
  getCurrentUserGuilds<T = unknown[]>(query?: Record<string, string | number | boolean>): Promise<T>;
  getUser<T = DiscordUser>(userId: Snowflake): Promise<T>;
  getGuild<T = Record<string, unknown>>(guildId: Snowflake, options?: { withCounts?: boolean }): Promise<T>;
  getGuildMember<T = DiscordMember>(guildId: Snowflake, userId: Snowflake): Promise<T>;
  getGuildMemberPermissions<T = Record<string, unknown>>(guildId: Snowflake, userId: Snowflake): Promise<T>;
  getGuildRolePermissions<T = Record<string, unknown>>(guildId: Snowflake, roleId: Snowflake): Promise<T>;
  getChannelMemberPermissions<T = Record<string, unknown>>(channelId: Snowflake, userId: Snowflake, options?: { implicit?: boolean }): Promise<T>;
  getChannelRolePermissions<T = Record<string, unknown>>(channelId: Snowflake, roleId: Snowflake, options?: { implicit?: boolean }): Promise<T>;
  getGuildChannels<T = unknown[]>(guildId: Snowflake): Promise<T>;
  getChannel<T = Record<string, unknown>>(channelId: Snowflake): Promise<T>;
  getChannelMessages<T = DiscordMessage[]>(channelId: Snowflake, options?: { limit?: number; before?: Snowflake; after?: Snowflake; around?: Snowflake }): Promise<T>;
  getMessage<T = DiscordMessage>(channelId: Snowflake, messageId: Snowflake): Promise<T>;
  createGuildChannel<T = Record<string, unknown>>(guildId: Snowflake, channel: Record<string, unknown>, reason?: string): Promise<T>;
  createThread<T = Record<string, unknown>>(channelId: Snowflake, options: { name: string; type?: 'public' | 'private'; autoArchiveDuration?: 60 | 1440 | 4320 | 10080; rateLimitPerUser?: number; invitable?: boolean; reason?: string }): Promise<T>;
  createThreadFromMessage<T = Record<string, unknown>>(channelId: Snowflake, messageId: Snowflake, options: { name: string; autoArchiveDuration?: 60 | 1440 | 4320 | 10080; rateLimitPerUser?: number; reason?: string }): Promise<T>;
  modifyChannel<T = Record<string, unknown>>(channelId: Snowflake, changes: Record<string, unknown>, reason?: string): Promise<T>;
  deleteChannel<T = unknown>(channelId: Snowflake, reason?: string): Promise<T>;
  setVoiceChannelStatus<T = unknown>(channelId: Snowflake, status: string | null, reason?: string): Promise<T>;
  getGuildRoles<T = unknown[]>(guildId: Snowflake): Promise<T>;
  getGuildRole<T = Record<string, unknown>>(guildId: Snowflake, roleId: Snowflake): Promise<T>;
  createGuildRole<T = Record<string, unknown>>(guildId: Snowflake, role: Record<string, unknown>, reason?: string): Promise<T>;
  addGuildMemberRole<T = unknown>(guildId: Snowflake, userId: Snowflake, roleId: Snowflake, reason?: string): Promise<T>;
  removeGuildMemberRole<T = unknown>(guildId: Snowflake, userId: Snowflake, roleId: Snowflake, reason?: string): Promise<T>;
  modifyGuildMember<T = DiscordMember>(guildId: Snowflake, userId: Snowflake, changes: Record<string, unknown>, reason?: string): Promise<T>;
  modifyCurrentMember<T = DiscordMember>(guildId: Snowflake, changes: Record<string, unknown>, reason?: string): Promise<T>;
  modifyGuildIncidentActions<T = Record<string, unknown>>(guildId: Snowflake, changes: Record<string, unknown>, reason?: string): Promise<T>;
  getGuildIncidentActions<T = Record<string, unknown>>(guildId: Snowflake): Promise<T>;
  removeGuildMember<T = unknown>(guildId: Snowflake, userId: Snowflake, reason?: string): Promise<T>;
  banGuildMember<T = unknown>(guildId: Snowflake, userId: Snowflake, options?: { deleteMessageSeconds?: number }, reason?: string): Promise<T>;
  unbanGuildMember<T = unknown>(guildId: Snowflake, userId: Snowflake, reason?: string): Promise<T>;
  getGuildEmojis<T = unknown[]>(guildId: Snowflake): Promise<T>;
  createGuildEmoji<T = Record<string, unknown>>(guildId: Snowflake, options: { name: string; image: string; roles?: Snowflake[]; reason?: string }): Promise<T>;
  deleteGuildEmoji<T = unknown>(guildId: Snowflake, emojiId: Snowflake): Promise<T>;
  getApplicationEmojis<T = unknown[]>(applicationId: Snowflake): Promise<T>;
  createApplicationEmoji<T = Record<string, unknown>>(applicationId: Snowflake, options: { name: string; image: string }): Promise<T>;
  deleteApplicationEmoji<T = unknown>(applicationId: Snowflake, emojiId: Snowflake): Promise<T>;
  createMessage<T = DiscordMessage>(channelId: Snowflake, payload: string | MessagePayload): Promise<T>;
  editMessage<T = DiscordMessage>(channelId: Snowflake, messageId: Snowflake, payload: string | MessagePayload): Promise<T>;
  deleteMessage<T = unknown>(channelId: Snowflake, messageId: Snowflake, reason?: string): Promise<T>;
  addMessageReaction<T = unknown>(channelId: Snowflake, messageId: Snowflake, emoji: string | { id?: Snowflake; name?: string }): Promise<T>;
  removeOwnMessageReaction<T = unknown>(channelId: Snowflake, messageId: Snowflake, emoji: string | { id?: Snowflake; name?: string }): Promise<T>;
  removeUserMessageReaction<T = unknown>(channelId: Snowflake, messageId: Snowflake, emoji: string | { id?: Snowflake; name?: string }, userId: Snowflake, reason?: string): Promise<T>;
  removeAllMessageReactions<T = unknown>(channelId: Snowflake, messageId: Snowflake): Promise<T>;
  removeAllMessageReactionsForEmoji<T = unknown>(channelId: Snowflake, messageId: Snowflake, emoji: string | { id?: Snowflake; name?: string }): Promise<T>;
  bulkDeleteMessages<T = unknown>(channelId: Snowflake, messageIds: Snowflake[], reason?: string): Promise<T>;
  createGuildSticker<T = Record<string, unknown>>(guildId: Snowflake, options: { name: string; description?: string; tags: string; file: Uint8Array; filename?: string; contentType?: string; reason?: string }): Promise<T>;
  createInteractionResponse<T = unknown>(interactionId: Snowflake, interactionToken: string, responseData: InteractionCallbackData, options?: { withResponse?: boolean }): Promise<T>;
  deferInteractionReply<T = unknown>(interactionId: Snowflake, interactionToken: string, options?: InteractionDeferOptions): Promise<T>;
  deferInteractionUpdate<T = unknown>(interactionId: Snowflake, interactionToken: string): Promise<T>;
  editOriginalInteractionResponse<T = DiscordMessage>(applicationId: Snowflake, interactionToken: string, payload: MessagePayload): Promise<T>;
  getGatewayBot<T = Record<string, unknown>>(): Promise<T>;
}

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  auth?: boolean;
  maxRetries?: number;
}

export interface ApplicationCommand {
  name: string;
  type?: number;
  description?: string;
  [key: string]: unknown;
}

export interface InteractionCallbackData {
  type: number;
  data?: MessagePayload;
}

export class DiscordAPIError extends Error {
  constructor(message: string, status: number, code: number, rawError: unknown);
  status: number;
  code: number;
  rawError: unknown;
}
export class InteractionAlreadyAcknowledgedError extends Error {
  constructor(interactionId: Snowflake);
  code: 'INTERACTION_ALREADY_ACKNOWLEDGED';
  interactionId: Snowflake;
}

export class RateLimiter {
  constructor();
  getRouteKey(route: string, method: string): string;
  acquire(routeKey: string): Promise<void>;
  handleHeaders(routeKey: string, headers: Headers, status: number, body: unknown): void;
  getStatus(): { limited: boolean; rateLimitedUntil: number; remainingMs: number };
  on(event: 'rateLimit', listener: (event: { route: string; scope: 'global' | 'route'; retryAfterMs: number; rateLimitedUntil: number }) => void): this;
}

export class InteractionSecurity {
  static verifyInteraction(options: { publicKey: string; signature: string; timestamp: string; rawBody: string | Uint8Array }): boolean;
  static signInteraction(privateKey: unknown, timestamp: string, rawBody: string | Uint8Array): string;
}

export interface StatisticsSettings {
  enabled?: boolean;
  retentionDays?: 30 | 90 | 180 | 365 | 'forever';
  commandUsage?: boolean;
  uniqueUsers?: boolean;
  returningUsers?: boolean;
}
export class CommandStatistics {
  constructor(options?: { settings?: StatisticsSettings; state?: Record<string, unknown>; onChange?: () => void });
  getSettings(): Required<StatisticsSettings>;
  updateSettings(patch?: StatisticsSettings): Required<StatisticsSettings>;
  recordCommand(input?: { name?: string; userId?: Snowflake; timestamp?: number }): boolean;
  getSummary(options?: { days?: number | 'forever' }): Record<string, unknown>;
  getCommand(name: string, options?: { days?: number | 'forever' }): Record<string, unknown>;
  exportState(): Record<string, unknown>;
  getTrackingState(): { commandUsage: boolean; uniqueUsers: boolean; returningUsers: boolean };
}
export const DEFAULT_STATISTICS_SETTINGS: Readonly<Required<StatisticsSettings>>;
export const DISCORD_ERROR_CODES: Map<number, string>;
export function getDiscordErrorGuidance(code: number | string): string | null;

export class EmbedBuilder {
  constructor(data?: Partial<EmbedData>);
  data: EmbedData;
  setTitle(title: string): this;
  setDescription(description: string): this;
  setURL(url: string): this;
  setColor(color: string | number): this;
  setTimestamp(timestamp?: string | number | Date): this;
  setFooter(footer: { text: string; iconURL?: string; icon_url?: string }): this;
  setImage(url: string): this;
  setThumbnail(url: string): this;
  setAuthor(author: { name: string; url?: string; iconURL?: string; icon_url?: string }): this;
  addField(name: string, value: string, inline?: boolean): this;
  addFields(...fields: Array<{ name: string; value: string; inline?: boolean } | Array<{ name: string; value: string; inline?: boolean }>>): this;
  toJSON(): EmbedData;
}

export interface EmojiInput {
  id?: Snowflake;
  name?: string;
  animated?: boolean;
}
export interface ButtonData extends ComponentData {
  style?: number;
  label?: string;
  custom_id?: string;
  url?: string;
  disabled?: boolean;
  emoji?: EmojiInput;
}
export interface SelectOptionData {
  label: string;
  value: string;
  description?: string;
  emoji?: EmojiInput;
  default?: boolean;
}
export interface SelectMenuData extends ComponentData {
  custom_id?: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  options?: Array<SelectOptionData | SelectOptionBuilder>;
  channel_types?: number[];
}
export function parseEmoji(emoji: string | EmojiInput | null | undefined): EmojiInput | undefined;
export class ButtonBuilder {
  constructor(data?: Partial<ButtonData>);
  data: ButtonData;
  setCustomId(id: string): this;
  setLabel(label: string): this;
  setStyle(style: number): this;
  setURL(url: string): this;
  setDisabled(disabled?: boolean): this;
  setEmoji(emoji: string | EmojiInput): this;
  toJSON(): ButtonData;
}
export class SelectOptionBuilder {
  constructor(data?: Partial<SelectOptionData>);
  data: SelectOptionData;
  setLabel(label: string): this;
  setValue(value: string): this;
  setDescription(description: string): this;
  setEmoji(emoji: string | EmojiInput): this;
  setDefault(value?: boolean): this;
  toJSON(): SelectOptionData;
}
export class StringSelectMenuBuilder {
  constructor(data?: Partial<SelectMenuData>);
  data: SelectMenuData & { options: SelectOptionBuilder[] };
  setCustomId(id: string): this;
  setPlaceholder(value: string): this;
  setMinValues(value: number): this;
  setMaxValues(value: number): this;
  addOptions(...options: Array<SelectOptionData | SelectOptionBuilder | Array<SelectOptionData | SelectOptionBuilder>>): this;
  toJSON(): SelectMenuData;
}
declare class EntitySelectMenuBuilder {
  data: SelectMenuData;
  setCustomId(id: string): this;
  setPlaceholder(value: string): this;
  setMinValues(value: number): this;
  setMaxValues(value: number): this;
  toJSON(): SelectMenuData;
}
export class UserSelectMenuBuilder extends EntitySelectMenuBuilder {
  constructor(data?: Partial<SelectMenuData>);
}
export class RoleSelectMenuBuilder extends EntitySelectMenuBuilder {
  constructor(data?: Partial<SelectMenuData>);
}
export class MentionableSelectMenuBuilder extends EntitySelectMenuBuilder {
  constructor(data?: Partial<SelectMenuData>);
}
export class ChannelSelectMenuBuilder extends EntitySelectMenuBuilder {
  constructor(data?: Partial<SelectMenuData>);
  setChannelTypes(...types: Array<number | number[]>): this;
}
export class ActionRowBuilder {
  constructor(components?: Array<ComponentData | { toJSON(): ComponentData }>);
  components: Array<ComponentData | { toJSON(): ComponentData }>;
  addComponents(...components: Array<ComponentData | { toJSON(): ComponentData } | Array<ComponentData | { toJSON(): ComponentData }>>): this;
  toJSON(): { type: number; components: ComponentData[] };
}

export const API_VERSION: number;
export const API_BASE: string;
export const GATEWAY_BASE: string;
export const CDN_BASE: string;
export const GatewayOpcodes: Readonly<{
  DISPATCH: number; HEARTBEAT: number; IDENTIFY: number; PRESENCE_UPDATE: number; VOICE_STATE_UPDATE: number;
  RESUME: number; RECONNECT: number; REQUEST_GUILD_MEMBERS: number; INVALID_SESSION: number; HELLO: number; HEARTBEAT_ACK: number;
}>;
export const GatewayCapabilities: Readonly<{ CHANNEL_OBFUSCATION: number }>;
export const ChannelFlags: Readonly<{
  PINNED: number; REQUIRE_TAG: number; HIDE_MEDIA_DOWNLOAD_OPTIONS: number; CHANNEL_OBFUSCATED: number; IS_SPOILER_CHANNEL: number;
}>;
export const PermissionFlags: Readonly<Record<PermissionFlagName, bigint>>;
export const PermissionFlagEntries: ReadonlyArray<{ name: string; mask: bigint; bit: number; legacyName: string; label: string }>;
export const GatewayCloseCodes: Readonly<{
  UNKNOWN_ERROR: number; UNKNOWN_OPCODE: number; DECODE_ERROR: number; NOT_AUTHENTICATED: number; AUTHENTICATION_FAILED: number;
  ALREADY_AUTHENTICATED: number; INVALID_SEQ: number; RATE_LIMITED: number; SESSION_TIMED_OUT: number; INVALID_SHARD: number;
  SHARDING_REQUIRED: number; INVALID_API_VERSION: number; INVALID_INTENTS: number; DISALLOWED_INTENTS: number;
}>;
export const FatalCloseCodes: Set<number>;
export const GatewayIntents: Readonly<Record<GatewayIntentName, number>>;
export const ActivityTypes: Readonly<{ PLAYING: number; STREAMING: number; LISTENING: number; WATCHING: number; CUSTOM: number; COMPETING: number }>;
export const InteractionTypes: Readonly<{ PING: number; APPLICATION_COMMAND: number; MESSAGE_COMPONENT: number; APPLICATION_COMMAND_AUTOCOMPLETE: number; MODAL_SUBMIT: number }>;
export const InteractionCallbackTypes: Readonly<{ PONG: number; CHANNEL_MESSAGE_WITH_SOURCE: number; DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: number; DEFERRED_UPDATE_MESSAGE: number; UPDATE_MESSAGE: number; APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: number; MODAL: number }>;
export const ComponentTypes: Readonly<{ ACTION_ROW: number; BUTTON: number; STRING_SELECT: number; TEXT_INPUT: number; USER_SELECT: number; ROLE_SELECT: number; MENTIONABLE_SELECT: number; CHANNEL_SELECT: number }>;
export const ButtonStyles: Readonly<{ PRIMARY: number; SECONDARY: number; SUCCESS: number; DANGER: number; LINK: number }>;
export const CDN: {
  avatar(userId: Snowflake, avatarHash: string | null, format?: string, size?: number): string;
  banner(userId: Snowflake, bannerHash: string | null, format?: string, size?: number): string | null;
  guildIcon(guildId: Snowflake, iconHash: string | null, format?: string, size?: number): string | null;
  customEmoji(emojiId: Snowflake, animated?: boolean, size?: number): string;
};
export const MODIFY_COMPONENT_STYLE_OPTIONS: ReadonlyArray<{ value: string; label: string }>;
export const DISCORD_OBJECT_PROPERTIES: Readonly<Record<string, ReadonlyArray<{ key: string; label: string; desc: string }>>>;
