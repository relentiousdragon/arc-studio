import { validateDiscordModalPayload } from './builders.js';
import { validateDiscordSemanticValue } from '../../DiscordValueValidation.js';
import { findFocusedSlashOption, findSlashParameter, getFocusedSlashOptionPath } from '../../SlashCommandOptions.js';

const INTERACTION_NODE_TYPES = new Set([
  'action_reply_interaction',
  'action_defer_reply',
  'action_defer_update',
  'action_edit_interaction_reply',
  'action_show_modal',
  'action_respond_autocomplete'
]);
//
export function isDiscordInteractionNodeType(type) {
  return INTERACTION_NODE_TYPES.has(type);
}

function buildMessagePayload(content, embed, components, files) {
  return {
    ...(content ? { content } : {}),
    ...(embed ? { embeds: [embed] } : {}),
    ...(Array.isArray(components) && components.length ? { components } : {}),
    ...(files?.length ? { files } : {})
  };
}

function interactionResponseError(error) {
  const unknownInteraction = Number(error?.code) === 10062
    || Number(error?.status) === 404 && /unknown interaction/i.test(String(error?.message || ''));
  if (!unknownInteraction) return error;
  return new Error('Discord rejected the initial interaction response because it arrived too late. Send Defer Reply or Defer Update before slow work, then use Reply to Interaction. Discord requires the initial response within 3 seconds.', { cause: error });
}

export async function executeDiscordInteractionNode(node, {
  resolveInput,
  resolveComponents,
  resolveFiles,
  buildEmbed,
  isInputConnected = () => false,
  rest,
  simulation = false,
  log,
  state,
  eventPayload,
  nodes,
  setOutput
}) {
  if (!isDiscordInteractionNodeType(node?.type)) return false;

  if (state.pending) await state.pending;
  const semanticInput = (pinId, fallback, semanticType, label, allowEmpty = false) => validateDiscordSemanticValue(
    resolveInput(pinId, fallback), semanticType, label, { simulation, allowEmpty: allowEmpty || simulation }
  );

  if (node.type === 'action_show_modal') {
    const interactionId = semanticInput('interaction_id', node.data?.interaction_id || '', 'interaction_id', 'Interaction ID');
    const interactionToken = semanticInput('interaction_token', node.data?.interaction_token || '', 'interaction_token', 'Interaction token');
    const modal = resolveInput('modal', node.data?.modal || null);
    if (!interactionToken) throw new Error('Show Popup Modal needs the Interaction Token from its event node.');
    const modalErrors = validateDiscordModalPayload(modal);
    if (modalErrors.length) throw new Error(`Popup Modal is invalid: ${modalErrors[0]}`);
    if (state.acknowledged) throw new Error('This interaction has already been acknowledged. Show a modal as the initial response, before any reply or defer node.');
    state.acknowledged = true;
    state.deferred = false;
    state.pending = rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 9, data: modal });
    try { await state.pending; }
    catch (error) { state.acknowledged = false; throw error; }
    finally { state.pending = null; }
    log('[Show Popup Modal] Modal opened.');
    setOutput?.('success', true);
    return true;
  }

  if (node.type === 'action_respond_autocomplete') {
    if (Number(eventPayload?.type) !== 4) throw new Error('Respond to Autocomplete can only run for an autocomplete interaction.');
    const interactionId = semanticInput('interaction_id', eventPayload?.id || '', 'interaction_id', 'Interaction ID');
    const interactionToken = semanticInput('interaction_token', eventPayload?.token || '', 'interaction_token', 'Interaction token');
    const focused = findFocusedSlashOption(eventPayload?.data?.options || []);
    const slashCommandNode = nodes.find((candidate) => candidate.type === 'event_slash_command' && String(candidate.data?.commandName || '').toLowerCase() === String(eventPayload?.data?.name || '').toLowerCase());
    const focusedPath = getFocusedSlashOptionPath(eventPayload?.data?.options || []);
    const autocompleteOption = findSlashParameter(slashCommandNode?.data?.options, focusedPath || []);
    if (!focused || !autocompleteOption?.autocomplete || !autocompleteOption.dynamicAutocomplete) throw new Error('This option is not configured for graph-generated autocomplete.');
    const type = Number(focused?.type || 3);
    const query = String(focused?.value ?? '').toLocaleLowerCase();
    const rawChoices = resolveInput('choices', node.data?.choices || []);
    const choices = (Array.isArray(rawChoices) ? rawChoices : []).slice(0, 500).flatMap((choice) => {
      if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return [];
      const name = String(choice.name ?? '').trim().slice(0, 100);
      const rawValue = choice.value;
      if (!name || rawValue === undefined || rawValue === null || !['string', 'number'].includes(typeof rawValue) || typeof rawValue === 'string' && !rawValue.trim()) return [];
      let value;
      if (type === 4) {
        value = Number(rawValue);
        if (!Number.isSafeInteger(value)) return [];
      } else if (type === 10) {
        value = Number(rawValue);
        if (!Number.isFinite(value)) return [];
      } else {
        value = String(rawValue).slice(0, 100);
        if (!value) return [];
      }
      if (query && !name.toLocaleLowerCase().includes(query) && !String(value).toLocaleLowerCase().includes(query)) return [];
      return [{ name, value }];
    }).slice(0, 25);
    if (!interactionToken) throw new Error('Autocomplete response is missing the interaction token.');
    if (state.acknowledged) throw new Error('This autocomplete interaction has already been answered.');
    state.acknowledged = true;
    state.pending = rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 8, data: { choices } });
    try { await state.pending; }
    catch (error) { state.acknowledged = false; throw error; }
    finally { state.pending = null; }
    setOutput('choice_count', choices.length);
    setOutput?.('success', true);
    log(`[Autocomplete] Sent ${choices.length} suggestion${choices.length === 1 ? '' : 's'}.`);
    return true;
  }

  if (node.type === 'action_reply_interaction') {
    const applicationId = semanticInput('application_id', node.data?.application_id || state.applicationId || '', 'application_id', 'Application ID', true);
    const interactionId = semanticInput('interaction_id', node.data?.interaction_id || eventPayload?.id || state.interactionId || '', 'interaction_id', 'Interaction ID', true);
    const interactionToken = semanticInput('interaction_token', node.data?.interaction_token || '', 'interaction_token', 'Interaction token', true);
    const content = String(resolveInput('content', node.data?.content || '')).slice(0, 2000);
    const embed = resolveInput('embed', null) || (Array.isArray(node.data?.blocks) ? buildEmbed() : null);
    const components = resolveComponents();
    const files = resolveFiles(resolveInput('files', node.data?.files || []));
    const ephemeral = Boolean(resolveInput('ephemeral', node.data?.ephemeral || false));
    const componentsV2 = components?.format === 'arc-components-v2' || node.data?.componentsV2Enabled === true;

    if (componentsV2) validateComponentsV2Mode(node, content, components, isInputConnected);
    if (interactionId) setOutput('interaction_id', interactionId);
    if (applicationId) setOutput('application_id', applicationId);
    if (interactionToken) setOutput('interaction_token', interactionToken);

    if (!interactionToken) {
      setOutput?.('success', false);
      log('[Action Reply] Error: Missing interaction token');
    } else {
      if (interactionId) state.interactionId = interactionId;
      log(`[Action Reply] Sending interaction response (ephemeral: ${ephemeral}).`);
      const responseData = componentsV2
        ? { flags: 32768 | (ephemeral ? 64 : 0), components: components.components, ...(files?.length ? { files } : {}) }
        : { ...buildMessagePayload(content, embed, components, files), flags: ephemeral ? 64 : 0 };
      if (state.deferred) {
        if (!applicationId) throw new Error('Replying after a defer needs the Application ID output from the event node.');
        if (typeof rest.editOriginalInteractionResponse !== 'function') throw new Error('This REST connection cannot edit a deferred interaction response.');
        const deferredPayload = componentsV2
          ? { ...responseData, flags: 32768, content: null, embeds: [] }
          : responseData;
        const message = await rest.editOriginalInteractionResponse(applicationId, interactionToken, deferredPayload);
        if (message && typeof message === 'object') setOutput('message', message);
        const messageId = message?.id;
        if (messageId) setOutput('message_id', String(messageId));
      } else {
        if (state.acknowledged) throw new Error('This interaction has already been acknowledged. Use only one initial reply or defer node for each interaction.');
        state.acknowledged = true;
        state.deferred = false;
        state.pending = rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 4, data: responseData }, { withResponse: true });
        let callbackResponse;
        try { callbackResponse = await state.pending; }
        catch (error) { state.acknowledged = false; throw interactionResponseError(error); }
        finally { state.pending = null; }
        const message = callbackResponse?.resource?.message || callbackResponse?.message || null;
        if (message) setOutput('message', message);
        const messageId = callbackResponse?.interaction?.response_message_id || message?.id;
        if (messageId) setOutput('message_id', String(messageId));
      }
      setOutput?.('success', true);
    }
    return true;
  }

  if (node.type === 'action_defer_reply' || node.type === 'action_defer_update') {
    const interactionId = semanticInput('interaction_id', node.data?.interaction_id || '', 'interaction_id', 'Interaction ID');
    const interactionToken = semanticInput('interaction_token', node.data?.interaction_token || '', 'interaction_token', 'Interaction token');
    const isUpdate = node.type === 'action_defer_update';
    const ephemeral = Boolean(resolveInput('ephemeral', node.data?.ephemeral || false));
    if (!interactionToken) throw new Error(`${isUpdate ? 'Defer Update' : 'Defer Reply'} needs an interaction token.`);
    if (interactionId) state.interactionId = interactionId;
    if (state.acknowledged) throw new Error('This interaction has already been acknowledged. Use only one initial reply or defer node for each interaction.');
    state.acknowledged = true;
    state.deferred = true;
    state.pending = isUpdate
      ? (rest.deferInteractionUpdate?.(interactionId || 'mock', interactionToken) || rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 6 }))
      : (rest.deferInteractionReply?.(interactionId || 'mock', interactionToken, { ephemeral }) || rest.createInteractionResponse(interactionId || 'mock', interactionToken, { type: 5, ...(ephemeral ? { data: { flags: 64 } } : {}) }));
    try {
      await state.pending;
      setOutput('interaction_token', interactionToken);
      if (interactionId) setOutput('interaction_id', interactionId);
      if (typeof setOutput === 'function') setOutput('success', true);
      log(`[${isUpdate ? 'Defer Update' : 'Defer Reply'}] Interaction acknowledged; continue with Reply to Interaction when ready.`);
    } catch (error) {
      state.acknowledged = false;
      state.deferred = false;
      throw error;
    } finally { state.pending = null; }
    return true;
  }

  const applicationId = semanticInput('application_id', node.data?.application_id || state.applicationId || '', 'application_id', 'Application ID');
  const interactionToken = semanticInput('interaction_token', node.data?.interaction_token || '', 'interaction_token', 'Interaction token');
  const content = String(resolveInput('content', node.data?.content || '')).slice(0, 2000);
  const embed = resolveInput('embed', null) || (Array.isArray(node.data?.blocks) ? buildEmbed() : null);
  const components = resolveComponents();
  const files = resolveFiles(resolveInput('files', node.data?.files || []));
  const componentsV2 = components?.format === 'arc-components-v2' || node.data?.componentsV2Enabled === true;

  if (componentsV2) validateComponentsV2Mode(node, content, components, isInputConnected);

  if (!applicationId) {
    setOutput?.('success', false);
    log('[Edit Interaction Reply] Error: Missing Application ID');
  } else if (!interactionToken) {
    setOutput?.('success', false);
    log('[Edit Interaction Reply] Error: Missing interaction token');
  } else {
    log('[Edit Interaction Reply] Editing original interaction response.');
    const payload = componentsV2
      ? { flags: 32768, content: null, embeds: [], components: components.components, ...(files?.length ? { files } : {}) }
      : buildMessagePayload(content, embed, components, files);
    if (typeof rest.editOriginalInteractionResponse !== 'function') throw new Error('This REST connection cannot edit interaction responses.');
    await rest.editOriginalInteractionResponse(applicationId, interactionToken, payload);
    setOutput?.('success', true);
  }
  return true;
}

function validateComponentsV2Mode(node, content, components, isInputConnected) {
  const hasContent = isInputConnected('content') || String(node.data?.content ?? '').trim() || String(content ?? '').trim();
  const hasEmbed = isInputConnected('embed') || Boolean(node.data?.embed) || (Array.isArray(node.data?.blocks) && node.data.blocks.length > 0);
  if (hasContent || hasEmbed) {
    throw new Error('Components V2 cannot be combined with message content or an embed. Clear those fields and disconnect their wires first.');
  }
  if (!components || components.format !== 'arc-components-v2') throw new Error('Components V2 is enabled but no Components V2 layout is connected or configured.');
  const errors = Array.isArray(components.validationErrors) ? components.validationErrors : [];
  if (errors.length) throw new Error(`Components V2 layout is invalid: ${errors[0]}`);
}
