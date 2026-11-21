import { validateDiscordSemanticValue } from '../../DiscordValueValidation.js';

const MESSAGE_NODE_TYPES = new Set(['action_send_message', 'action_edit_message', 'action_delete_message', 'action_add_reaction', 'action_remove_reaction']);
//
export function isDiscordMessageNodeType(type) {
  return MESSAGE_NODE_TYPES.has(type);
}

export async function executeDiscordMessageNode(node, {
  resolveInput,
  resolveComponents,
  resolveFiles,
  buildEmbed,
  isInputConnected = () => false,
  rest,
  simulation = false,
  setOutput,
  log
}) {
  if (!isDiscordMessageNodeType(node?.type)) return false;

  if (node.type === 'action_delete_message') {
    const channelId = validateDiscordSemanticValue(resolveInput('channel_id', node.data?.channel_id || ''), 'channel_id', 'Channel ID', { simulation, allowEmpty: true });
    const messageId = validateDiscordSemanticValue(resolveInput('message_id', node.data?.message_id || ''), 'message_id', 'Message ID', { simulation, allowEmpty: true });
    const reason = String(resolveInput('reason', node.data?.reason || '')).trim();
    if (!channelId || !messageId) {
      setOutput?.('success', false);
      log('[Action Delete Message] Error: Missing Channel ID or Message ID');
    } else {
      await rest.deleteMessage(channelId, messageId, reason || undefined);
      setOutput?.('success', true);
      log(`[Action Delete Message] Deleted message ${messageId} from channel ${channelId}`);
    }
    return true;
  }

  if (node.type === 'action_add_reaction' || node.type === 'action_remove_reaction') {
    const channelId = validateDiscordSemanticValue(resolveInput('channel_id', node.data?.channel_id || ''), 'channel_id', 'Channel ID', { simulation, allowEmpty: true });
    const messageId = validateDiscordSemanticValue(resolveInput('message_id', node.data?.message_id || ''), 'message_id', 'Message ID', { simulation, allowEmpty: true });
    const target = String(resolveInput('target', node.data?.target || 'own'));
    const emoji = String(resolveInput('emoji', node.data?.emoji || '')).trim();
    const userId = validateDiscordSemanticValue(resolveInput('user_id', node.data?.user_id || ''), 'user_id', 'User ID', { simulation, allowEmpty: true });
    const reason = String(resolveInput('reason', node.data?.reason || '')).trim();
    if (!channelId || !messageId || (node.type === 'action_add_reaction' && !emoji)
      || (node.type === 'action_remove_reaction' && ['own', 'user', 'emoji'].includes(target) && !emoji)
      || (node.type === 'action_remove_reaction' && target === 'user' && !userId)) {
      setOutput?.('success', false);
      log(`[${node.type === 'action_add_reaction' ? 'Add Reaction' : 'Remove Reaction'}] Missing required channel, message, emoji, or user input.`);
    } else if (node.type === 'action_add_reaction') {
      await rest.addMessageReaction(channelId, messageId, emoji);
      setOutput?.('success', true);
      log(`[Add Reaction] Added ${emoji} to message ${messageId}.`);
    } else if (target === 'own') {
      await rest.removeOwnMessageReaction(channelId, messageId, emoji);
      setOutput?.('success', true);
      log(`[Remove Reaction] Removed the bot’s ${emoji} reaction from message ${messageId}.`);
    } else if (target === 'user') {
      await rest.removeUserMessageReaction(channelId, messageId, emoji, userId, reason || undefined);
      setOutput?.('success', true);
      log(`[Remove Reaction] Removed ${userId}’s ${emoji} reaction from message ${messageId}.`);
    } else if (target === 'emoji') {
      await rest.removeAllMessageReactionsForEmoji(channelId, messageId, emoji);
      setOutput?.('success', true);
      log(`[Remove Reaction] Removed all ${emoji} reactions from message ${messageId}.`);
    } else if (target === 'all') {
      await rest.removeAllMessageReactions(channelId, messageId);
      setOutput?.('success', true);
      log(`[Remove Reaction] Removed all reactions from message ${messageId}.`);
    } else {
      throw new TypeError('Choose a valid reaction removal option.');
    }
    return true;
  }

  if (node.type === 'action_send_message') {
    const channelId = validateDiscordSemanticValue(resolveInput('channel_id', node.data?.channel_id || ''), 'channel_id', 'Channel ID', { simulation, allowEmpty: true });
    const threadId = validateDiscordSemanticValue(resolveInput('thread_id', node.data?.thread_id || ''), 'thread_id', 'Thread ID', { simulation, allowEmpty: true });
    const destinationId = threadId || channelId;
    const content = String(resolveInput('content', node.data?.content || '')).slice(0, 2000);
    const embed = resolveInput('embed', null) || (Array.isArray(node.data?.blocks) ? buildEmbed() : null);
    const components = resolveComponents();
    const files = await resolveFiles(resolveInput('files', node.data?.files || []), [embed, components]);
    const fileData = String(resolveInput('file_data', node.data?.file_data || ''));
    const fileName = String(resolveInput('file_name', node.data?.file_name || 'image.png'));
    const replyToMessageId = validateDiscordSemanticValue(resolveInput('reply_to_message_id', node.data?.reply_to_message_id || ''), 'message_id', 'Reply message ID', { simulation, allowEmpty: true });
    const mentionRepliedUser = Boolean(resolveInput('mention_replied_user', node.data?.mention_replied_user ?? Boolean(replyToMessageId)));
    const componentsV2 = components?.format === 'arc-components-v2' || node.data?.componentsV2Enabled === true;

    if (componentsV2) validateComponentsV2Mode(components, isInputConnected);

    if (!destinationId) {
      setOutput?.('success', false);
      log('[Action Send Message] Error: Missing Channel ID or Thread ID');
    } else {
      const payload = {};
      if (componentsV2) {
        payload.flags = 32768;
        payload.components = components.components;
      } else {
        if (content) payload.content = content;
        if (embed) payload.embeds = [embed];
        if (isInputConnected('components')) {
          payload.components = Array.isArray(components) ? components : [];
        } else if (Array.isArray(components) && components.length) {
          payload.components = components;
        }
      }
      if (files?.length) payload.files = files;
      if (replyToMessageId) {
        payload.message_reference = { message_id: replyToMessageId };
        payload.allowed_mentions = { replied_user: mentionRepliedUser };
      }
      if (fileData) {
        payload.file_data = fileData;
        payload.file_name = fileName || 'image.png';
      }

      log(`[Action Send Message] Sending message to ${threadId ? `thread ${threadId}` : `channel ${channelId}`}.`);
      const sentMessage = await rest.createMessage(destinationId, payload);
      if (sentMessage?.id) setOutput('message_id', sentMessage.id);
      setOutput?.('success', Boolean(sentMessage?.id ?? true));
    }
    return true;
  }

  const channelId = validateDiscordSemanticValue(resolveInput('channel_id', node.data?.channel_id || ''), 'channel_id', 'Channel ID', { simulation, allowEmpty: true });
  const messageId = validateDiscordSemanticValue(resolveInput('message_id', node.data?.message_id || ''), 'message_id', 'Message ID', { simulation, allowEmpty: true });
  const content = resolveInput('content', node.data?.content);
  const embed = resolveInput('embed', null) || (Array.isArray(node.data?.blocks) ? buildEmbed() : null);
  const components = resolveComponents();
    const files = await resolveFiles(resolveInput('files', node.data?.files || []), [embed, components]);
  const componentsV2 = components?.format === 'arc-components-v2' || node.data?.componentsV2Enabled === true;

  if (componentsV2) validateComponentsV2Mode(components, isInputConnected);

  if (!channelId || !messageId) {
    setOutput?.('success', false);
    log('[Action Edit Message] Error: Missing Channel ID or Message ID');
  } else {
    const payload = {};
    if (componentsV2) {
      payload.flags = 32768;
      payload.content = null;
      payload.embeds = [];
      payload.components = components.components;
    } else {
      if (content !== undefined && content !== null && String(content).length > 0) payload.content = String(content).slice(0, 2000);
      if (embed) payload.embeds = [embed];
      if (isInputConnected('components')) {
        payload.components = Array.isArray(components) ? components : [];
      } else if (Array.isArray(components) && components.length) {
        payload.components = components;
      }
    }
    if (files?.length) {
      payload.files = files;
    } else if (isInputConnected('files')) {
      payload.attachments = [];
    }

    log(`[Action Edit Message] Editing message ${messageId} in channel ${channelId}`);
    const editedMessage = await rest.editMessage(channelId, messageId, payload);
    if (editedMessage?.id) setOutput('message_id', editedMessage.id);
    setOutput?.('success', Boolean(editedMessage?.id ?? true));
  }
  return true;
}

function validateComponentsV2Mode(components, isInputConnected) {
  if (isInputConnected('content') || isInputConnected('embed')) {
    throw new Error('Components V2 cannot be combined with message content or an embed. Disconnect the content or embed wire first.');
  }
  if (!components || components.format !== 'arc-components-v2') throw new Error('Components V2 is enabled but no Components V2 layout is connected or configured.');
  const errors = Array.isArray(components.validationErrors) ? components.validationErrors : [];
  if (errors.length) throw new Error(`Components V2 layout is invalid: ${errors[0]}`);
}
