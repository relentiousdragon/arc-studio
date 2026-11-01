/**
 * Emits `gatewayDispatch` with the raw Discord event name and payload for every Gateway dispatch
 */
import { EventEmitter } from 'node:events';
import { RESTClient } from '../rest/RESTClient.js';
import { GatewayShard } from '../gateway/GatewayShard.js';
import { GatewayIntents, GatewayOpcodes, InteractionCallbackTypes } from '../constants.js';
//
export class Client extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.intents]
  * @param {number} [options.capabilities]
   * @param {string} [options.token]
   */
  constructor(options = {}) {
    super();
    this.token = options.token || null;
    this.intents = options.intents ?? (
      GatewayIntents.GUILDS |
      GatewayIntents.GUILD_MESSAGES |
      GatewayIntents.MESSAGE_CONTENT |
      GatewayIntents.GUILD_EMOJIS_AND_STICKERS
    );
    this.capabilities = options.capabilities ?? 0;

    this.rest = new RESTClient({ token: this.token });
    /** @type {GatewayShard|null} */
    this.ws = null;
    this.gatewayBindings = [];
    this.user = null;
    this.readyAt = null;
    this.presence = { since: null, activities: [], status: 'online', afk: false };
  }

  /**
   * Connect to Discord Gateway and init REST
   * @param {string} [token]
   * @returns {Promise<Client>}
   */
  async login(token) {
    if (token) this.token = token;
    if (!this.token) throw new Error('A valid Discord Bot Token must be provided to login.');

    this.disposeGateway();
    this.rest.setToken(this.token);

    const shard = new GatewayShard({
      token: this.token,
      intents: this.intents,
      capabilities: this.capabilities
    });
    this.ws = shard;
    const listen = (eventName, listener) => {
      shard.on(eventName, listener);
      this.gatewayBindings.push({ shard, eventName, listener });
    };
//
    listen('status', (status) => this.emit('status', status));
    listen('heartbeatLatency', (latencyMs) => this.emit('heartbeatLatency', latencyMs));
    listen('diagnostics', (diagnostics) => this.emit('gatewayDiagnostics', diagnostics));
    listen('dispatch', (eventName, payload) => this.emit('gatewayDispatch', eventName, payload));
    listen('debug', (msg) => this.emit('debug', msg));
    listen('error', (err) => this.emit('error', err));
    listen('fatalError', (err) => this.emit('fatalError', err));
    this.emit('gatewayDiagnostics', shard.getDiagnostics());

    listen('READY', (data) => {
      this.user = data.user;
      this.readyAt = new Date();
      this.emit('ready', this);
    });

    listen('MESSAGE_CREATE', (msg) => this.emit('messageCreate', msg));
    listen('INTERACTION_CREATE', (interaction) => this.emit('interactionCreate', interaction));
    listen('GUILD_CREATE', (guild) => this.emit('guildCreate', guild));
    listen('GUILD_MEMBER_ADD', (member) => this.emit('guildMemberAdd', member));

    for (const eventName of [
      'MESSAGE_UPDATE', 'MESSAGE_DELETE', 'MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE',
      'CHANNEL_CREATE', 'CHANNEL_UPDATE', 'CHANNEL_DELETE', 'GUILD_MEMBER_REMOVE',
      'VOICE_STATE_UPDATE', 'PRESENCE_UPDATE', 'GUILD_BAN_ADD', 'GUILD_BAN_REMOVE',
      'GUILD_SCHEDULED_EVENT_CREATE', 'GUILD_SCHEDULED_EVENT_UPDATE', 'GUILD_SCHEDULED_EVENT_DELETE',
      'AUTO_MODERATION_ACTION_EXECUTION', 'GUILD_CREATE', 'GUILD_UPDATE', 'GUILD_DELETE',
      'GUILD_ROLE_CREATE', 'GUILD_ROLE_UPDATE', 'GUILD_ROLE_DELETE', 'THREAD_CREATE', 'THREAD_UPDATE',
      'THREAD_DELETE', 'TYPING_START', 'CHANNEL_PINS_UPDATE', 'MESSAGE_REACTION_REMOVE_ALL',
      'INVITE_CREATE', 'INVITE_DELETE'
    ]) listen(eventName, (payload) => this.emit(eventName, payload));

    shard.connect();
    return this;
  }
//
  disposeGateway() {
    const shard = this.ws;
    if (!shard) {
      this.gatewayBindings = [];
      return;
    }

    try {
      shard.destroy();
    } finally {
      for (const binding of this.gatewayBindings) {
        if (binding.shard === shard) shard.off(binding.eventName, binding.listener);
      }
      this.gatewayBindings = this.gatewayBindings.filter((binding) => binding.shard !== shard);
      shard.removeAllListeners();
      if (this.ws === shard) this.ws = null;
    }
  }

  destroy() {
    this.disposeGateway();
    this.user = null;
    this.readyAt = null;
    this.emit('destroy');
  }

  getGatewayDiagnostics() {
    return this.ws?.getDiagnostics() || {
      shardId: 0,
      status: 'DISCONNECTED',
      reconnectAttempts: 0,
      lastCloseCode: null,
      lastCloseReason: '',
      heartbeatLatencyMs: null,
      sessionResumed: null,
      resumeCount: 0,
      hasResumableSession: false
    };
  }

  /**
   * @param {object} presence
   */
  setPresence(presence) {
    if (this.ws) {
      const update = presence && typeof presence === 'object' ? presence : {};
      this.presence = {
        ...this.presence,
        ...update,
        activities: Array.isArray(update.activities)
          ? update.activities.map((activity) => ({ ...activity, ...(activity?.emoji ? { emoji: { ...activity.emoji } } : {}) }))
          : this.presence.activities
      };
      this.ws.updatePresence(this.presence);
    }
  }

  setVoiceChannel(guildId, channelId, options = {}) {
    if (!this.ws) throw new Error('Connect to the Discord Gateway before changing voice state.');
    if (!guildId) throw new TypeError('A guild ID is required.');
    this.ws.send(GatewayOpcodes.VOICE_STATE_UPDATE, {
      guild_id: String(guildId),
      channel_id: channelId ? String(channelId) : null,
      self_mute: Boolean(options.selfMute),
      self_deaf: Boolean(options.selfDeaf)
    });
  }

  /**
   * @param {string} channelId
   * @param {string|object} contentOrPayload
   */
  async sendMessage(channelId, contentOrPayload) {
    return this.rest.createMessage(channelId, contentOrPayload);
  }

  /**
   * @param {string} channelId
   * @param {string} messageId
   * @param {string|object} contentOrPayload
   */
  async editMessage(channelId, messageId, contentOrPayload) {
    return this.rest.editMessage(channelId, messageId, contentOrPayload);
  }

  /**
   * @param {string} interactionId
   * @param {string} interactionToken
   * @param {object} responseData
   */
  async replyInteraction(interactionId, interactionToken, responseData) {
    return this.rest.createInteractionResponse(interactionId, interactionToken, {
      type: InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
      data: typeof responseData === 'string' ? { content: responseData } : responseData
    });
  }
}
