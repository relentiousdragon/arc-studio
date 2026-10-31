import { evaluateDataNode } from './data.js';

const GUILD_NODE_TYPES = new Set([
  'action_fetch_user', 'action_fetch_guild', 'action_fetch_member',
  'action_fetch_channel', 'action_fetch_channel_messages', 'action_fetch_message',
  'action_create_thread', 'action_start_thread_from_message',
  'action_create_channel', 'action_edit_channel', 'action_delete_channel',
  'action_create_role', 'action_member_role', 'action_moderate_member',
  'action_voice_channel_status', 'action_voice_state'
]);
//
export function isDiscordGuildNodeType(type) {
  return GUILD_NODE_TYPES.has(type);
}

export async function executeDiscordGuildNode(node, {
  resolveInput,
  isInputConnected = () => false,
  rest,
  client,
  setOutput,
  log
}) {
  if (!isDiscordGuildNodeType(node?.type)) return false;
  if (node.type === 'action_fetch_user') {
          const userId = String(resolveInput('user_id', node.data?.user_id || '')).trim();
          if (!userId) throw new TypeError('Get User Info needs a User ID.');
          if (typeof rest?.getUser !== 'function') throw new Error('Get User Info requires a connected Discord REST client.');
          const user = await rest.getUser(userId);
          if (!user || typeof user !== 'object' || Array.isArray(user)) throw new Error('Discord did not return a valid user object.');
          for (const [pinId, value] of Object.entries({
            user, user_id_out: user.id || userId, username: user.username || '', global_name: user.global_name || '',
            discriminator: user.discriminator || '', avatar: user.avatar || '', bot: Boolean(user.bot), public_flags: Number(user.public_flags) || 0
          })) setOutput(pinId, value);
          log(`[Get User Info] Fetched user ${user.id || userId}.`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_fetch_guild') {
          const guildId = String(resolveInput('guild_id', node.data?.guild_id || '')).trim();
          if (!guildId) throw new TypeError('Get Server Info needs a Server ID.');
          if (typeof rest?.getGuild !== 'function') throw new Error('Get Server Info requires a connected Discord REST client.');
          const guild = await rest.getGuild(guildId, { withCounts: true });
          if (!guild || typeof guild !== 'object' || Array.isArray(guild)) throw new Error('Discord did not return a valid server object.');
          for (const [pinId, value] of Object.entries({
            guild, guild_id_out: guild.id || guildId, name: guild.name || '', owner_id: guild.owner_id || '',
            description: guild.description || '', icon: guild.icon || '',
            member_count: Number(guild.approximate_member_count ?? guild.member_count) || 0,
            features: Array.isArray(guild.features) ? guild.features : [], preferred_locale: guild.preferred_locale || '',
            verification_level: Number(guild.verification_level) || 0
          })) setOutput(pinId, value);
          log(`[Get Server Info] Fetched server ${guild.id || guildId}.`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_fetch_member') {
          const guildId = String(resolveInput('guild_id', node.data?.guild_id || '')).trim();
          const userId = String(resolveInput('user_id', node.data?.user_id || '')).trim();
          if (!guildId || !userId) throw new TypeError('Get Server Member needs a Server ID and User ID.');
          if (typeof rest?.getGuildMember !== 'function') throw new Error('Get Server Member requires a connected Discord REST client.');
          const member = await rest.getGuildMember(guildId, userId);
          if (!member || typeof member !== 'object' || Array.isArray(member)) throw new Error('Discord did not return a valid member object.');
          const user = member.user && typeof member.user === 'object' ? member.user : {};
          for (const [pinId, value] of Object.entries({
            member, user, user_id_out: user.id || userId, username: user.username || '', nickname: member.nick || '',
            roles: Array.isArray(member.roles) ? member.roles : [], joined_at: member.joined_at || '',
            premium_since: member.premium_since || '', deaf: Boolean(member.deaf), mute: Boolean(member.mute), pending: Boolean(member.pending)
          })) setOutput(pinId, value);
          log(`[Get Server Member] Fetched member ${user.id || userId} in server ${guildId}.`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_fetch_channel') {
          const channelId = String(resolveInput('channel_id', node.data?.channel_id || '')).trim();
          if (!channelId) throw new TypeError('Get Channel Info needs a Channel ID.');
          if (typeof rest?.getChannel !== 'function') throw new Error('Get Channel Info requires a connected Discord REST client.');
          const channel = await rest.getChannel(channelId);
          if (!channel || typeof channel !== 'object' || Array.isArray(channel)) throw new Error('Discord did not return a valid channel object.');
          for (const [pinId, value] of Object.entries({
            channel, channel_id_out: channel.id || channelId, name: channel.name || '', type: Number(channel.type) || 0,
            guild_id: channel.guild_id || '', parent_id: channel.parent_id || '', topic: channel.topic || '',
            nsfw: Boolean(channel.nsfw), last_message_id: channel.last_message_id || ''
          })) setOutput(pinId, value);
          log(`[Get Channel Info] Fetched channel ${channel.id || channelId}.`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_fetch_channel_messages') {
          const channelId = String(resolveInput('channel_id', node.data?.channel_id || '')).trim();
          const limit = Number(resolveInput('limit', node.data?.limit ?? 50));
          const before = String(resolveInput('before', node.data?.before || '')).trim();
          const after = String(resolveInput('after', node.data?.after || '')).trim();
          const around = String(resolveInput('around', node.data?.around || '')).trim();
          if (!channelId) throw new TypeError('Get Channel Messages needs a Channel ID.');
          if (typeof rest?.getChannelMessages !== 'function') throw new Error('Get Channel Messages requires a connected Discord REST client.');
          const messages = await rest.getChannelMessages(channelId, { limit, before, after, around });
          if (!Array.isArray(messages)) throw new Error('Discord did not return a valid message list.');
          setOutput('messages', messages);
          setOutput('count', messages.length);
          setOutput('first_message', messages[0] || null);
          setOutput('last_message', messages.at(-1) || null);
          log(`[Get Channel Messages] Fetched ${messages.length} message${messages.length === 1 ? '' : 's'} from ${channelId}.`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_fetch_message') {
          const channelId = String(resolveInput('channel_id', node.data?.channel_id || '')).trim();
          const messageId = String(resolveInput('message_id', node.data?.message_id || '')).trim();
          if (!channelId || !messageId) throw new TypeError('Get Message needs a Channel ID and Message ID.');
          if (typeof rest?.getMessage !== 'function') throw new Error('Get Message requires a connected Discord REST client.');
          const message = await rest.getMessage(channelId, messageId);
          if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Discord did not return a valid message object.');
          for (const [pinId, value] of Object.entries({
            message, message_id_out: message.id || messageId, channel_id_out: message.channel_id || channelId,
            content: message.content || '', author_id: message.author?.id || '', timestamp: message.timestamp || '',
            edited_timestamp: message.edited_timestamp || '', attachments: message.attachments || [], embeds: message.embeds || [],
            components: message.components || [], pinned: Boolean(message.pinned)
          })) setOutput(pinId, value);
          log(`[Get Message] Fetched message ${message.id || messageId} from ${channelId}.`);
          setOutput('success', true);
          return true;
  } else if (node.type === 'action_create_thread') {
          const channelId = String(resolveInput('channel_id', node.data?.channel_id || '')).trim();
          const messageId = String(resolveInput('message_id', node.data?.message_id || '')).trim();
          const messageIdConnected = Boolean(isInputConnected('message_id'));
          const name = String(resolveInput('name', node.data?.name || '')).trim();
          const threadType = String(resolveInput('thread_type', node.data?.thread_type || 'public')).trim().toLowerCase();
          const autoArchiveDuration = Number(resolveInput('auto_archive_duration', node.data?.auto_archive_duration ?? 1440));
          const rateLimitPerUser = resolveInput('rate_limit_per_user', node.data?.rate_limit_per_user ?? 0);
          const invitable = Boolean(resolveInput('invitable', node.data?.invitable ?? true));
          if (!channelId || !name) throw new Error('Create Thread needs a parent channel ID and thread name.');
          const reason = resolveInput('reason', node.data?.reason || '');
          let result;
          let resultThreadType = threadType;
          if (messageIdConnected || messageId) {
            if (!messageId) throw new Error('Create Thread from Message needs a message ID.');
            if (typeof rest?.createThreadFromMessage !== 'function') throw new Error('Create Thread from Message requires a connected Discord REST client.');
            result = await rest.createThreadFromMessage(channelId, messageId, { name, autoArchiveDuration, rateLimitPerUser, reason });
            resultThreadType = 'public';
          } else {
            if (!['public', 'private'].includes(threadType)) throw new Error('Create Thread type must be public or private.');
            if (typeof rest?.createThread !== 'function') throw new Error('Create Thread requires a connected Discord REST client.');
            result = await rest.createThread(channelId, {
              name, type: threadType, autoArchiveDuration, rateLimitPerUser, invitable, reason
            });
          }
          setOutput('thread_id', result?.id || '');
          setOutput('parent_channel_id', result?.parent_id || channelId);
          log(`[Create Thread] Created ${resultThreadType} thread ${result?.id || name} in channel ${channelId}.`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_start_thread_from_message') {
          const channelId = String(resolveInput('channel_id', node.data?.channel_id || '')).trim();
          const messageId = String(resolveInput('message_id', node.data?.message_id || '')).trim();
          const name = String(resolveInput('name', node.data?.name || '')).trim();
          const autoArchiveDuration = Number(resolveInput('auto_archive_duration', node.data?.auto_archive_duration ?? 1440));
          const rateLimitPerUser = resolveInput('rate_limit_per_user', node.data?.rate_limit_per_user ?? 0);
          if (!channelId || !messageId || !name) throw new Error('Start Thread from Message needs a parent channel ID, message ID, and thread name.');
          if (typeof rest?.createThreadFromMessage !== 'function') throw new Error('Start Thread from Message requires a connected Discord REST client.');
          const result = await rest.createThreadFromMessage(channelId, messageId, {
            name, autoArchiveDuration, rateLimitPerUser,
            reason: resolveInput('reason', node.data?.reason || '')
          });
          setOutput('thread_id', result?.id || '');
          setOutput('parent_channel_id', result?.parent_id || channelId);
          log(`[Start Thread from Message] Created thread ${result?.id || name} from message ${messageId}.`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_create_channel') {
          const guildId = String(resolveInput('guild_id', node.data?.guild_id || '')).trim();
          const name = String(resolveInput('name', node.data?.name || '')).trim().slice(0, 100);
          const channelType = String(resolveInput('channel_type', node.data?.channel_type || 'text')).toLowerCase();
          const types = { text: 0, voice: 2, category: 4, announcement: 5, stage: 13 };
          const body = { name, type: types[channelType] ?? 0 };
          const parentId = String(resolveInput('parent_id', node.data?.parent_id || '')).trim();
          const overwriteSource = resolveInput('permission_overwrites', node.data?.permission_overwrites || []);
          const topic = String(resolveInput('topic', node.data?.topic || '')).slice(0, 1024);
          if (parentId) body.parent_id = parentId;
          if (overwriteSource?.length) {
            let overwrites = overwriteSource;
            if (typeof overwrites === 'string') {
              try { overwrites = JSON.parse(overwrites); } catch { throw new Error('Permission overwrites must be an array.'); }
            }
            if (!Array.isArray(overwrites) || overwrites.length > 100) throw new Error('Permission overwrites must be an array with at most 100 entries.');
            body.permission_overwrites = overwrites;
          }
          if (topic && [0, 5].includes(body.type)) body.topic = topic;
          if (!guildId || !name) throw new Error('Create Channel needs a server ID and channel name.');
          const result = await rest.createGuildChannel(guildId, body, resolveInput('reason', node.data?.reason || ''));
          setOutput('channel_id', result?.id || '');
          log(`[Create Channel] Created #${name}${result?.id ? ` (${result.id})` : ''}`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_edit_channel') {
          const threadId = String(resolveInput('thread_id', node.data?.thread_id || '')).trim();
          const threadIdConnected = Boolean(isInputConnected('thread_id'));
          if (threadIdConnected && !threadId) throw new Error('Edit Thread needs a thread ID.');
          const channelId = threadId || String(resolveInput('channel_id', node.data?.channel_id || '')).trim();
          const body = {};
          const name = String(resolveInput('name', node.data?.name || '')).trim();
          const topic = String(resolveInput('topic', node.data?.topic || ''));
          const parentId = String(resolveInput('parent_id', node.data?.parent_id || '')).trim();
          if (name) body.name = name.slice(0, 100);
          if (threadId) {
            const setThreadField = (key, transform = (value) => value, { skipEmpty = false } = {}) => {
              const connected = Boolean(isInputConnected(key));
              if (!Object.prototype.hasOwnProperty.call(node.data || {}, key) && !connected) return;
              const value = resolveInput(key, node.data?.[key]);
              if (skipEmpty && !connected && (value == null || value === '')) return;
              body[key] = transform(value);
            };
            setThreadField('rate_limit_per_user', (value) => Math.max(0, Math.min(21600, Math.trunc(Number(value) || 0))), { skipEmpty: true });
            setThreadField('archived', Boolean, { skipEmpty: true });
            setThreadField('locked', Boolean, { skipEmpty: true });
            setThreadField('invitable', Boolean, { skipEmpty: true });
            setThreadField('auto_archive_duration', (value) => {
              const duration = Number(value);
              if (![60, 1440, 4320, 10080].includes(duration)) throw new Error('Thread auto archive duration must be 60, 1440, 4320, or 10080 minutes.');
              return duration;
            }, { skipEmpty: true });
          } else {
            if (topic) body.topic = topic.slice(0, 1024);
            if (parentId) body.parent_id = parentId;
            const overwriteSource = resolveInput('permission_overwrites', node.data?.permission_overwrites || []);
            if (overwriteSource?.length) {
              let overwrites = overwriteSource;
              if (typeof overwrites === 'string') {
                try { overwrites = JSON.parse(overwrites); } catch { throw new Error('Permission overwrites must be an array.'); }
              }
              if (!Array.isArray(overwrites) || overwrites.length > 100) throw new Error('Permission overwrites must be an array with at most 100 entries.');
              body.permission_overwrites = overwrites;
            } else if (Number(node.data?.overwriteCount) > 0) {
              const targetInputs = Object.fromEntries(Object.keys(node.data || {}).filter((key) => /^target_id_\d+$/.test(key)).map((key) => [key, resolveInput(key, node.data[key])]));
              body.permission_overwrites = evaluateDataNode('data_permission_overwrites', targetInputs, node.data).overwrites;
            }
          }
          if (!threadId) {
            const setOptionalChannelField = (key, transform = (value) => value, { skipEmpty = false } = {}) => {
              const connection = isInputConnected(key);
              if (!Object.prototype.hasOwnProperty.call(node.data || {}, key) && !connection) return;
              const value = resolveInput(key, node.data?.[key]);
              if (skipEmpty && !connection && (value == null || value === '')) return;
              body[key] = transform(value);
            };
            setOptionalChannelField('rate_limit_per_user', (value) => Math.max(0, Math.min(21600, Math.trunc(Number(value) || 0))), { skipEmpty: true });
            setOptionalChannelField('nsfw', Boolean);
            setOptionalChannelField('bitrate', (value) => Math.max(8000, Math.min(384000, Math.trunc(Number(value) || 8000))), { skipEmpty: true });
            setOptionalChannelField('user_limit', (value) => Math.max(0, Math.min(10000, Math.trunc(Number(value) || 0))), { skipEmpty: true });
            setOptionalChannelField('rtc_region', (value) => value === '' ? null : String(value).slice(0, 100));
            setOptionalChannelField('video_quality_mode', (value) => Number(value) === 2 ? 2 : 1, { skipEmpty: true });
            setOptionalChannelField('default_auto_archive_duration', (value) => [60, 1440, 4320, 10080].includes(Number(value)) ? Number(value) : 1440, { skipEmpty: true });
          }
          if (!channelId) throw new Error('Edit Channel needs a channel ID.');
          if (!Object.keys(body).length) throw new Error('Connect or enter at least one channel field to change.');
          const result = await rest.modifyChannel(channelId, body, resolveInput('reason', node.data?.reason || ''));
          setOutput('channel_id_out', result?.id || channelId);
          log(`[Edit Channel] Updated channel ${channelId}`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_delete_channel') {
          const channelId = String(resolveInput('channel_id', node.data?.channel_id || '')).trim();
          if (!channelId) throw new Error('Delete Channel needs a channel ID.');
          await rest.deleteChannel(channelId, resolveInput('reason', node.data?.reason || ''));
          setOutput('deleted_channel_id', channelId);
          log(`[Delete Channel] Deleted channel ${channelId}`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_create_role') {
          const guildId = String(resolveInput('guild_id', node.data?.guild_id || '')).trim();
          const name = String(resolveInput('name', node.data?.name || 'new role')).trim().slice(0, 100);
          const color = Math.max(0, Math.min(0xffffff, Math.trunc(Number(resolveInput('color', node.data?.color || 0)) || 0)));
          const permissions = String(resolveInput('permissions', node.data?.permissions || '0')).trim();
          if (!/^\d{1,20}$/.test(permissions)) throw new Error('Role permissions must be a decimal permission bitfield string.');
          const hoist = Boolean(resolveInput('hoist', node.data?.hoist || false));
          const mentionable = Boolean(resolveInput('mentionable', node.data?.mentionable || false));
          if (!guildId || !name) throw new Error('Create Role needs a server ID and role name.');
          const role = await rest.createGuildRole(guildId, { name, color, permissions, hoist, mentionable }, resolveInput('reason', node.data?.reason || ''));
          setOutput('role_id', role?.id || '');
          log(`[Create Role] Created ${name}${role?.id ? ` (${role.id})` : ''}`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_member_role') {
          const guildId = String(resolveInput('guild_id', node.data?.guild_id || '')).trim();
          const userId = String(resolveInput('user_id', node.data?.user_id || '')).trim();
          const roleId = String(resolveInput('role_id', node.data?.role_id || '')).trim();
          const operation = String(resolveInput('operation', node.data?.operation || 'add')).toLowerCase();
          const reason = resolveInput('reason', node.data?.reason || '');
          if (!guildId || !userId || !roleId) throw new Error('Set Member Role needs server, user, and role IDs.');
          if (operation === 'remove') await rest.removeGuildMemberRole(guildId, userId, roleId, reason);
          else await rest.addGuildMemberRole(guildId, userId, roleId, reason);
          log(`[Member Role] ${operation === 'remove' ? 'Removed' : 'Added'} role ${roleId} for ${userId}`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_moderate_member') {
          let success = false;
          let errorMessage = '';
          const guildId = String(resolveInput('guild_id', node.data?.guild_id || '')).trim();
          const userId = String(resolveInput('user_id', node.data?.user_id || '')).trim();
          const operation = String(resolveInput('operation', node.data?.operation || 'timeout')).trim().toLowerCase();
          const reason = String(resolveInput('reason', node.data?.reason || '')).trim().slice(0, 512);
          try {
            if (!guildId || !/^\d{15,22}$/.test(userId)) throw new TypeError('Choose a server and a valid member ID.');
            if (operation === 'timeout') {
              const durationMinutes = Math.trunc(Number(resolveInput('duration_minutes', node.data?.duration_minutes ?? 10)));
              if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 40320) throw new RangeError('Timeout duration must be from 1 minute to 28 days.');
              const disabledUntil = new Date(Date.now() + durationMinutes * 60_000).toISOString();
              await rest.modifyGuildMember(guildId, userId, { communication_disabled_until: disabledUntil }, reason);
            } else if (operation === 'kick') {
              await rest.removeGuildMember(guildId, userId, reason);
            } else if (operation === 'ban') {
              const deleteMessageSeconds = Math.trunc(Number(resolveInput('delete_message_seconds', node.data?.delete_message_seconds ?? 0)));
              if (!Number.isInteger(deleteMessageSeconds) || deleteMessageSeconds < 0 || deleteMessageSeconds > 604800) throw new RangeError('Ban message deletion must be from 0 seconds to 7 days.');
              await rest.banGuildMember(guildId, userId, { deleteMessageSeconds }, reason);
            } else if (operation === 'unban') {
              await rest.unbanGuildMember(guildId, userId, reason);
            } else {
              throw new TypeError('Choose timeout, kick, ban, or unban.');
            }
            success = true;
          } catch (error) {
            errorMessage = String(error?.message || 'Discord rejected the moderation request.').slice(0, 500);
          }
          setOutput('success', success);
          setOutput('error', errorMessage);
          log(success
            ? `[Moderation] ${operation} succeeded for ${userId}`
            : `[Moderation] ${operation} failed for ${userId}: ${errorMessage}`);
          return success ? true : 'failure';
        } else if (node.type === 'action_voice_channel_status') {
          const channelId = String(resolveInput('channel_id', node.data?.channel_id || '')).trim();
          const status = String(resolveInput('status', node.data?.status || '')).slice(0, 500);
          if (!channelId) throw new Error('Set Voice Channel Status needs a channel ID.');
          await rest.setVoiceChannelStatus(channelId, status || null, resolveInput('reason', node.data?.reason || ''));
          log(`[Voice Channel Status] ${status ? `Set status to “${status}”` : 'Cleared status'} for ${channelId}`);
          setOutput('success', true);
          return true;
        } else if (node.type === 'action_voice_state') {
          const guildId = String(resolveInput('guild_id', node.data?.guild_id || '')).trim();
          const channelId = String(resolveInput('channel_id', node.data?.channel_id || '')).trim();
          if (!guildId) throw new Error('Voice join or leave needs a server ID.');
          if (!client || typeof client.setVoiceChannel !== 'function') throw new Error('Voice state changes require a live Gateway connection.');
          client.setVoiceChannel(guildId, channelId || null, {
            selfMute: resolveInput('self_mute', node.data?.self_mute || false),
            selfDeaf: resolveInput('self_deaf', node.data?.self_deaf || false)
          });
          log(channelId ? `[Voice] Requested join to channel ${channelId}. Audio transport is not enabled.` : `[Voice] Requested leave from server ${guildId}.`);
          setOutput('success', true);
          return true;

  }
  return false;
}
