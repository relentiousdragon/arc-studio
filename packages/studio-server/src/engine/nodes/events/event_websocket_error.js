export default {
  description: 'Runs when a WebSocket connection encounters an error. Set Filter Connection ID to listen for one connection.',
  type: 'event_websocket_error',
  category: 'Events',
  label: 'On WebSocket Error',
  color: '#0ea5e9',
  gatewayEvent: 'WEBSOCKET_ERROR',
  inputs: [{ id: 'filter_connection_id', label: 'Filter Connection ID', type: 'string', defaultValue: '', description: "Only handle events from this connection ID. Leave blank for all connections."}],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Runs when a WebSocket connection encounters an error."},
    { id: 'connection_id', label: 'Connection ID', type: 'string', eventPath: 'connectionId', description: "ID of the WebSocket connection."},
    { id: 'error', label: 'Error', type: 'string', eventPath: 'error', description: "Error reported by the WebSocket connection."},
    { id: 'url', label: 'URL', type: 'string', eventPath: 'url', description: "URL used for the WebSocket connection."}
  ]
};
