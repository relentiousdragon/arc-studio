import { nodeDefinitions } from './nodes/index.js';
//
export const NodeCategories = Object.freeze({
  EVENTS: 'Events',
  ACTIONS: 'Discord Actions',
  LOGIC: 'Logic & Flow',
  VARIABLES: 'Variables',
  VALUES: 'Values & Data',
  FUNCTIONS: 'Functions',
  CRYPTO: 'Cryptography & Security',
  MATH: 'Math',
  NETWORK: 'Web & Network'
});

const SEMANTIC_STRING_PIN_TYPES = Object.freeze({
  application_id: 'application_id', channel_id: 'channel_id', thread_id: 'thread_id', parent_id: 'channel_id',
  guild_id: 'guild_id', server_id: 'guild_id', user_id: 'user_id', author_id: 'user_id', member_id: 'user_id',
  role_id: 'role_id', message_id: 'message_id', referenced_message_id: 'message_id', interaction_id: 'interaction_id',
  interaction_token: 'interaction_token'
});

export const NodeDefinitions = Object.fromEntries(nodeDefinitions.map((definition) => [definition.type, {
  ...definition,
  inputs: (definition.inputs || []).map((pin) => pin.type === 'string' && SEMANTIC_STRING_PIN_TYPES[pin.id]
    ? { ...pin, semanticType: SEMANTIC_STRING_PIN_TYPES[pin.id] }
    : pin),
  outputs: (definition.outputs || []).map((pin) => pin.type === 'string' && SEMANTIC_STRING_PIN_TYPES[pin.id]
    ? { ...pin, semanticType: SEMANTIC_STRING_PIN_TYPES[pin.id] }
    : pin)
}]));
