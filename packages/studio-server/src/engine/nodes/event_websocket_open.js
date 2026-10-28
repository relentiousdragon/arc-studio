export default {
  description: 'Runs when a WebSocket connection opens. Set Filter Connection ID to listen for one connection.',
  type: 'event_websocket_open',
  category: 'Events',
  label: 'On WebSocket Open',
  color: '#0ea5e9',
  gatewayEvent: 'WEBSOCKET_OPEN',
  inputs: [{ id: 'filter_connection_id', label: 'Filter Connection ID', type: 'string', defaultValue: '' }],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'connection_id', label: 'Connection ID', type: 'string', eventPath: 'connectionId' },
    { id: 'url', label: 'URL', type: 'string', eventPath: 'url' }
  ]
};
