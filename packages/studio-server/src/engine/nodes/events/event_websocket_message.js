export default {
  description: 'Runs when a WebSocket message arrives. Binary data is provided as base64. Set Filter Connection ID to listen for one connection.',
  type: 'event_websocket_message',
  category: 'Events',
  label: 'On WebSocket Message',
  color: '#0ea5e9',
  gatewayEvent: 'WEBSOCKET_MESSAGE',
  inputs: [{ id: 'filter_connection_id', label: 'Filter Connection ID', type: 'string', defaultValue: '', description: "Only handle events from this connection ID. Leave blank for all connections."}],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Runs when a WebSocket message arrives."},
    { id: 'connection_id', label: 'Connection ID', type: 'string', eventPath: 'connectionId', description: "ID of the WebSocket connection."},
    { id: 'data', label: 'Message', type: 'string', eventPath: 'data', description: "Data received in the WebSocket message."},
    { id: 'is_binary', label: 'Is Binary', type: 'boolean', eventPath: 'isBinary', description: "Whether the WebSocket message contains binary data."},
    { id: 'byte_length', label: 'Byte Length', type: 'number', eventPath: 'byteLength', description: "Message size in bytes."},
    { id: 'url', label: 'URL', type: 'string', eventPath: 'url', description: "URL used for the WebSocket connection."}
  ]
};
