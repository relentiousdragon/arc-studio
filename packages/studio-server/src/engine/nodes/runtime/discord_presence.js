const PRESENCE_NODE_TYPES = new Set(['action_set_custom_status', 'action_set_presence']);
const VALID_STATUSES = new Set(['online', 'idle', 'dnd', 'invisible']);
const VALID_ACTIVITY_TYPES = new Set([0, 1, 2, 3, 5]);
//
export function isPresenceNodeType(type) {
  return PRESENCE_NODE_TYPES.has(type);
}

function buildCustomStatus(node, resolveInput) {
  const rawStatusText = String(resolveInput('status_text', node.data?.status_text ?? 'ARC Studio')).trim();
  const customEmojiMatch = rawStatusText.match(/<(?<animated>a?):(?<name>[A-Za-z0-9_]{2,32}):(?<id>\d{17,20})>/);
  const statusText = customEmojiMatch
    ? rawStatusText.replace(customEmojiMatch[0], '').replace(/\s{2,}/g, ' ').trim().slice(0, 128)
    : rawStatusText.slice(0, 128);
  const emoji = customEmojiMatch ? {
    name: customEmojiMatch.groups.name,
    id: customEmojiMatch.groups.id,
    ...(customEmojiMatch.groups.animated ? { animated: true } : {})
  } : null;
  return {
    presence: {
      activities: statusText || emoji
        ? [{ name: 'Custom Status', type: 4, ...(statusText ? { state: statusText } : {}), ...(emoji ? { emoji } : {}) }]
        : []
    },
    logMessage: `[Action Custom Status] Updating custom status: ${statusText || (emoji ? 'emoji only' : 'cleared')}`
  };
}

function buildBotPresence(node, resolveInput) {
  const requestedStatus = String(resolveInput('status', node.data?.status || 'online')).trim().toLowerCase();
  const status = VALID_STATUSES.has(requestedStatus) ? requestedStatus : 'online';
  const activityText = String(resolveInput('activity_text', node.data?.activity_text || 'ARC Studio')).trim().slice(0, 128) || 'ARC Studio';
  const requestedActivityType = Number(resolveInput('activity_type', node.data?.activity_type ?? 0));
  const activityType = VALID_ACTIVITY_TYPES.has(requestedActivityType) ? requestedActivityType : 0;
  const activityUrl = activityType === 1 ? String(resolveInput('stream_url', node.data?.stream_url || '')).trim() : '';
  if (activityType === 1) {
    let parsed;
    try {
      parsed = new URL(activityUrl);
    } catch {
      throw new Error('Streaming activity needs a valid HTTP or HTTPS stream URL.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error('Streaming activity needs a valid HTTP or HTTPS stream URL.');
    }
  }

  return {
    presence: {
      status,
      activities: [{ name: activityText, type: activityType, ...(activityUrl ? { url: activityUrl } : {}) }]
    },
    logMessage: `[Action Presence] Updating status: ${status}, Activity: ${activityText} (type ${activityType})`
  };
}

export function executePresenceNode(node, { resolveInput, context, log, setOutput }) {
  if (!isPresenceNodeType(node?.type)) return false;
  const { presence, logMessage } = node.type === 'action_set_custom_status'
    ? buildCustomStatus(node, resolveInput)
    : buildBotPresence(node, resolveInput);
  log(logMessage);
  if (typeof context.client?.setPresence === 'function') context.client.setPresence(presence);
  if (typeof setOutput === 'function') setOutput('success', true);
  return true;
}
