export default {
  description: 'Runs when a WebSocket connection closes. Set Filter Connection ID to listen for one connection.',
  type: 'event_websocket_close',
  category: 'Events',
  label: 'On WebSocket Close',
  color: '#0ea5e9',
  gatewayEvent: 'WEBSOCKET_CLOSE',
  inputs: [{ id: 'filter_connection_id', label: 'Filter Connection ID', type: 'string', defaultValue: '' }],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'connection_id', label: 'Connection ID', type: 'string', eventPath: 'connectionId' },
    { id: 'code', label: 'Code', type: 'number', eventPath: 'code' },
    { id: 'reason', label: 'Reason', type: 'string', eventPath: 'reason' },
    { id: 'was_clean', label: 'Was Clean', type: 'boolean', eventPath: 'wasClean' }
  ]
};
