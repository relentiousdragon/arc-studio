export default {
  description: 'Runs when a WebSocket message arrives. Binary data is provided as base64. Set Filter Connection ID to listen for one connection.',
  type: 'event_websocket_message',
  category: 'Events',
  label: 'On WebSocket Message',
  color: '#0ea5e9',
  gatewayEvent: 'WEBSOCKET_MESSAGE',
  inputs: [{ id: 'filter_connection_id', label: 'Filter Connection ID', type: 'string', defaultValue: '' }],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'connection_id', label: 'Connection ID', type: 'string', eventPath: 'connectionId' },
    { id: 'data', label: 'Message', type: 'string', eventPath: 'data' },
    { id: 'is_binary', label: 'Is Binary', type: 'boolean', eventPath: 'isBinary' },
    { id: 'byte_length', label: 'Byte Length', type: 'number', eventPath: 'byteLength' },
    { id: 'url', label: 'URL', type: 'string', eventPath: 'url' }
  ]
};
