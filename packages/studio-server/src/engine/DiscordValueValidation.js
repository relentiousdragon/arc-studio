const SNOWFLAKE_FIELDS = new Set(['application_id', 'channel_id', 'thread_id', 'guild_id', 'user_id', 'message_id', 'interaction_id', 'role_id']);
//
export function isValidDiscordSnowflake(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{1,20}$/.test(text)) return false;
  try {
    const snowflake = BigInt(text);
    return snowflake > 0n && snowflake <= 18446744073709551615n;
  } catch { return false; }
}

export function validateDiscordSemanticValue(value, semanticType, label = 'Discord value', { simulation = false, allowEmpty = false } = {}) {
  const text = String(value ?? '').trim();
  if (!text && allowEmpty) return text;
  if (!text) throw new Error(`${label} is required.`);
  if (semanticType === 'interaction_token') {
    if (text.length > 4000 || /[\s\u0000-\u001f\u007f]/u.test(text)) throw new Error(`${label} must be a valid Discord interaction token.`);
    return text;
  }
  const field = String(semanticType || '');
  if (SNOWFLAKE_FIELDS.has(field) && !simulation && !isValidDiscordSnowflake(text)) {
    throw new Error(`${label} must be a valid positive Discord snowflake ID.`);
  }
  return text;
}
