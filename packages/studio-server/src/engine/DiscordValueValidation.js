const SNOWFLAKE_FIELDS = new Set(['application_id', 'channel_id', 'thread_id', 'guild_id', 'user_id', 'message_id', 'interaction_id', 'role_id']);
//
export function isValidDiscordSnowflake(value) {
  return /^\d{1,20}$/.test(String(value ?? '').trim());
}

export function validateDiscordSemanticValue(value, semanticType, label = 'Discord value', { simulation = false, allowEmpty = false } = {}) {
  const text = String(value ?? '').trim();
  if (!text && allowEmpty) return text;
  if (!text) throw new Error(`${label} is required.`);
  if (semanticType === 'interaction_token') {
    if (text.length > 4000 || /[\u0000-\u0020\u007f]/u.test(text)) throw new Error(`${label} must be a valid Discord interaction token.`);
    return text;
  }
  const field = String(semanticType || '');
  if (SNOWFLAKE_FIELDS.has(field) && !simulation && !isValidDiscordSnowflake(text)) {
    throw new Error(`${label} must be a numeric Discord ID with at most 20 digits.`);
  }
  return text;
}
