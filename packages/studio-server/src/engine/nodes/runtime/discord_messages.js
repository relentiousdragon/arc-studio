import { validateDiscordSemanticValue } from '../../DiscordValueValidation.js';

const MESSAGE_NODE_TYPES = new Set(['action_send_message', 'action_edit_message', 'action_edit_components']);
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

  if (node.type === 'action_send_message') {
    const channelId = validateDiscordSemanticValue(resolveInput('channel_id', node.data?.channel_id || ''), 'channel_id', 'Channel ID', { simulation, allowEmpty: true });
    const threadId = validateDiscordSemanticValue(resolveInput('thread_id', node.data?.thread_id || ''), 'thread_id', 'Thread ID', { simulation, allowEmpty: true });
    const destinationId = threadId || channelId;
    const content = String(resolveInput('content', node.data?.content || '')).slice(0, 2000);
    const embed = resolveInput('embed', null) || (Array.isArray(node.data?.blocks) ? buildEmbed() : null);
    const components = resolveComponents();
    const files = resolveFiles(resolveInput('files', node.data?.files || []));
    const fileData = String(resolveInput('file_data', node.data?.file_data || ''));
    const fileName = String(resolveInput('file_name', node.data?.file_name || 'image.png'));
    const replyToMessageId = validateDiscordSemanticValue(resolveInput('reply_to_message_id', node.data?.reply_to_message_id || ''), 'message_id', 'Reply message ID', { simulation, allowEmpty: true });
    const mentionRepliedUser = Boolean(resolveInput('mention_replied_user', node.data?.mention_replied_user ?? Boolean(replyToMessageId)));
    const componentsV2 = components?.format === 'arc-components-v2' || node.data?.componentsV2Enabled === true;

    if (componentsV2) validateComponentsV2Mode(node, content, components, isInputConnected);

    if (!destinationId) {
      log('[Action Send Message] Error: Missing Channel ID or Thread ID');
    } else {
      const payload = {};
      if (componentsV2) {
        payload.flags = 32768;
        payload.components = components.components;
      } else {
        if (content) payload.content = content;
        if (embed) payload.embeds = [embed];
        if (Array.isArray(components) && components.length) payload.components = components;
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
    }
    return true;
  }

  if (node.type === 'action_edit_components') {
    const channelId = validateDiscordSemanticValue(resolveInput('channel_id', node.data?.channel_id || ''), 'channel_id', 'Channel ID', { simulation, allowEmpty: true });
    const messageId = validateDiscordSemanticValue(resolveInput('message_id', node.data?.message_id || ''), 'message_id', 'Message ID', { simulation, allowEmpty: true });
    const components = resolveComponents();
    const componentsV2 = components?.format === 'arc-components-v2' || node.data?.componentsV2Enabled === true;
    if (componentsV2) validateComponentsV2Mode(node, '', components, isInputConnected);
    if (!channelId || !messageId) throw new Error('Edit Components needs a Channel ID and Message ID.');
    const payload = componentsV2
      ? { flags: 32768, content: null, embeds: [], components: components.components }
      : { components: Array.isArray(components) ? components : [] };
    log(`[Edit Components] Replacing components on message ${messageId} in channel ${channelId}.`);
    const editedMessage = await rest.editMessage(channelId, messageId, payload);
    if (editedMessage?.id) setOutput('message_id', editedMessage.id);
    return true;
  }

  const channelId = validateDiscordSemanticValue(resolveInput('channel_id', node.data?.channel_id || ''), 'channel_id', 'Channel ID', { simulation, allowEmpty: true });
  const messageId = validateDiscordSemanticValue(resolveInput('message_id', node.data?.message_id || ''), 'message_id', 'Message ID', { simulation, allowEmpty: true });
  const content = resolveInput('content', node.data?.content);
  const embed = resolveInput('embed', null) || (Array.isArray(node.data?.blocks) ? buildEmbed() : null);
  const components = resolveComponents();
  const files = resolveFiles(resolveInput('files', node.data?.files || []));
  const componentsV2 = components?.format === 'arc-components-v2' || node.data?.componentsV2Enabled === true;

  if (componentsV2) validateComponentsV2Mode(node, content, components, isInputConnected);

  if (!channelId || !messageId) {
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
      if (Array.isArray(components) && components.length) payload.components = components;
    }
    if (files?.length) payload.files = files;

    log(`[Action Edit Message] Editing message ${messageId} in channel ${channelId}`);
    const editedMessage = await rest.editMessage(channelId, messageId, payload);
    if (editedMessage?.id) setOutput('message_id', editedMessage.id);
  }
  return true;
}

function validateComponentsV2Mode(node, content, components, isInputConnected) {
  const contentInputConnected = isInputConnected('content');
  const embedInputConnected = isInputConnected('embed');
  const configuredContent = String(node.data?.content ?? '').trim();
  const configuredEmbed = Boolean(node.data?.embed) || Array.isArray(node.data?.blocks) && node.data.blocks.length > 0;
  if (contentInputConnected || embedInputConnected || configuredContent || String(content ?? '').trim() || configuredEmbed) {
    throw new Error('Components V2 cannot be combined with message content or an embed. Clear those fields and disconnect their wires first.');
  }
  if (!components || components.format !== 'arc-components-v2') throw new Error('Components V2 is enabled but no Components V2 layout is connected or configured.');
  const errors = Array.isArray(components.validationErrors) ? components.validationErrors : [];
  if (errors.length) throw new Error(`Components V2 layout is invalid: ${errors[0]}`);
}
