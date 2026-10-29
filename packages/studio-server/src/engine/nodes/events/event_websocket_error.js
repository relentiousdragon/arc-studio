export default {
  description: 'Runs when a WebSocket connection encounters an error. Set Filter Connection ID to listen for one connection.',
  type: 'event_websocket_error',
  category: 'Events',
  label: 'On WebSocket Error',
  color: '#0ea5e9',
  gatewayEvent: 'WEBSOCKET_ERROR',
  inputs: [{ id: 'filter_connection_id', label: 'Filter Connection ID', type: 'string', defaultValue: '' }],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'connection_id', label: 'Connection ID', type: 'string', eventPath: 'connectionId' },
    { id: 'error', label: 'Error', type: 'string', eventPath: 'error' },
    { id: 'url', label: 'URL', type: 'string', eventPath: 'url' }
  ]
};
