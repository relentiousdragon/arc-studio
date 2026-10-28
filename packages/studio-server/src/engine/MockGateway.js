import { EventEmitter } from 'node:events';
//
export class MockGateway extends EventEmitter {
  constructor() {
    super();
    this.interceptedOutputs = [];
    this.executionHistory = [];
  }

  static getPresetTemplates() {
    return {
      MESSAGE_CREATE: {
        id: '120000000000000001',
        channel_id: '120000000000000002',
        guild_id: '120000000000000000',
        author: {
          id: '990000000000000001',
          username: 'BaldDude68',
          discriminator: '0',
          avatar: null,
          bot: false
        },
        content: '!ping',
        timestamp: new Date().toISOString()
      },
      SLASH_COMMAND: {
        id: '120000000000000010',
        application_id: '120000000000000099',
        type: 2, // APPLICATION_COMMAND
        token: 'mock_interaction_token_abcdef123456',
        channel_id: '120000000000000002',
        guild_id: '120000000000000000',
        member: {
          user: {
            id: '990000000000000001',
            username: 'BaldDude68',
            discriminator: '0',
            bot: false
          }
        },
        data: {
          id: '120000000000000020',
          name: 'help',
          options: [
            { name: 'category', value: 'moderation' }
          ]
        }
      },
      BUTTON_CLICK: {
        id: '120000000000000030',
        application_id: '120000000000000099',
        type: 3, // MESSAGE_COMPONENT
        token: 'mock_button_token_xyz987',
        channel_id: '120000000000000002',
        guild_id: '120000000000000000',
        member: {
          user: {
            id: '990000000000000001',
            username: 'BaldDude68',
            discriminator: '0',
            bot: false
          }
        },
        data: {
          component_type: 2,
          custom_id: 'btn_confirm'
        }
      },
      GUILD_MEMBER_ADD: {
        guild_id: '120000000000000000',
        user: {
          id: '990000000000000002',
          username: 'BaldDude68',
          discriminator: '0',
          bot: false
        },
        joined_at: new Date().toISOString()
      }
    };
  }

  /**
   * @param {Array} outputSink
   */
  createMockREST(outputSink) {
    return {
      createMessage: async (channelId, payload) => {
        const normalizedPayload = typeof payload === 'string' ? { content: payload } : { ...(payload || {}) };
        if (normalizedPayload.file_data) {
          normalizedPayload.attachments = [{ id: 0, filename: normalizedPayload.file_name || 'attachment.bin', simulated: true }];
          delete normalizedPayload.file_data;
          delete normalizedPayload.file_name;
        }
        if (typeof normalizedPayload.files === 'string') {
          try { normalizedPayload.files = JSON.parse(normalizedPayload.files); } catch { normalizedPayload.files = []; }
        }
        if (Array.isArray(normalizedPayload.files)) {
          normalizedPayload.attachments = [...(normalizedPayload.attachments || []), ...normalizedPayload.files.map((file, id) => ({ id, filename: file.filename || file.name || `attachment-${id + 1}`, simulated: true }))];
          delete normalizedPayload.files;
        }
        const record = {
          type: 'CREATE_MESSAGE',
          channelId,
          payload: normalizedPayload,
          timestamp: new Date().toISOString()
        };
        outputSink.push(record);
        return {
          id: `mock_msg_${Date.now()}`,
          channel_id: channelId,
          ...record.payload
        };
      },
      editMessage: async (channelId, messageId, payload) => {
        const normalizedPayload = typeof payload === 'string' ? { content: payload } : { ...(payload || {}) };
        const record = {
          type: 'EDIT_MESSAGE',
          channelId,
          messageId,
          payload: normalizedPayload,
          timestamp: new Date().toISOString()
        };
        outputSink.push(record);
        return {
          id: messageId,
          channel_id: channelId,
          ...record.payload
        };
      },
      createInteractionResponse: async (interactionId, interactionToken, responseData, { withResponse = false } = {}) => {
        const safeResponse = responseData && typeof responseData === 'object' ? structuredClone(responseData) : responseData;
        let responseFiles = safeResponse?.data?.files;
        if (typeof responseFiles === 'string') {
          try { responseFiles = JSON.parse(responseFiles); } catch { responseFiles = []; }
        }
        if (Array.isArray(responseFiles)) {
          safeResponse.data.attachments = responseFiles.map((file, id) => ({ id, filename: file.filename || file.name || `attachment-${id + 1}`, simulated: true }));
          delete safeResponse.data.files;
        }
        const record = {
          type: 'INTERACTION_RESPONSE',
          interactionId,
          interactionToken,
          responseData: safeResponse,
          timestamp: new Date().toISOString()
        };
        outputSink.push(record);
        if (withResponse && responseData?.type === 4) {
          const messageId = `mock_${interactionId}`;
          const message = { id: messageId, ...(safeResponse.data || {}) };
          return { interaction: { id: String(interactionId), response_message_id: messageId }, resource: { type: 4, message } };
        }
        return { success: true };
      },
      deferInteractionReply: (interactionId, interactionToken, options) => this.createMockREST(outputSink).createInteractionResponse(interactionId, interactionToken, {
        type: 5,
        ...(options?.ephemeral ? { data: { flags: 64 } } : {})
      }),
      deferInteractionUpdate: (interactionId, interactionToken) => this.createMockREST(outputSink).createInteractionResponse(interactionId, interactionToken, { type: 6 }),
      editOriginalInteractionResponse: async (applicationId, interactionToken, payload) => {
        outputSink.push({
          type: 'EDIT_ORIGINAL_INTERACTION_RESPONSE',
          applicationId,
          interactionToken,
          payload: structuredClone(payload || {}),
          timestamp: new Date().toISOString()
        });
        return { id: `mock_${String(interactionToken).replace(/[^a-zA-Z0-9]/g, '').slice(-20)}`, ...(payload || {}) };
      },
      createGuildEmoji: async (guildId, data) => {
        const record = {
          type: 'CREATE_EMOJI',
          guildId,
          name: data.name,
          timestamp: new Date().toISOString()
        };
        outputSink.push(record);
        return { id: `mock_emoji_${Date.now()}`, name: data.name };
      },
      createGuildChannel: async (guildId, data, reason) => {
        const id = `mock_channel_${Date.now()}`;
        outputSink.push({ type: 'CREATE_CHANNEL', guildId, channel: data, reason, timestamp: new Date().toISOString() });
        return { id, guild_id: guildId, ...data };
      },
      createThread: async (channelId, options) => {
        const id = `mock_thread_${Date.now()}`;
        outputSink.push({ type: 'CREATE_THREAD', channelId, options, timestamp: new Date().toISOString() });
        return { id, parent_id: channelId, name: options.name, type: options.type === 'private' ? 12 : 11 };
      },
      createThreadFromMessage: async (channelId, messageId, options) => {
        const id = `mock_thread_${Date.now()}`;
        outputSink.push({ type: 'CREATE_THREAD_FROM_MESSAGE', channelId, messageId, options, timestamp: new Date().toISOString() });
        return { id, parent_id: channelId, name: options.name, type: 11 };
      },
      modifyChannel: async (channelId, changes, reason) => {
        outputSink.push({ type: 'EDIT_CHANNEL', channelId, changes, reason, timestamp: new Date().toISOString() });
        return { id: channelId, ...changes };
      },
      deleteChannel: async (channelId, reason) => {
        outputSink.push({ type: 'DELETE_CHANNEL', channelId, reason, timestamp: new Date().toISOString() });
        return { id: channelId };
      },
      createGuildRole: async (guildId, role, reason) => {
        const id = `mock_role_${Date.now()}`;
        outputSink.push({ type: 'CREATE_ROLE', guildId, role, reason, timestamp: new Date().toISOString() });
        return { id, ...role };
      },
      addGuildMemberRole: async (guildId, userId, roleId, reason) => {
        outputSink.push({ type: 'ADD_MEMBER_ROLE', guildId, userId, roleId, reason, timestamp: new Date().toISOString() });
      },
      removeGuildMemberRole: async (guildId, userId, roleId, reason) => {
        outputSink.push({ type: 'REMOVE_MEMBER_ROLE', guildId, userId, roleId, reason, timestamp: new Date().toISOString() });
      },
      setVoiceChannelStatus: async (channelId, status, reason) => {
        outputSink.push({ type: 'SET_VOICE_CHANNEL_STATUS', channelId, status, reason, timestamp: new Date().toISOString() });
      }
    };
  }
}
