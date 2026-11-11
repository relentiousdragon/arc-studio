export default {
  description: 'Runs when a WebSocket connection closes. Set Filter Connection ID to listen for one connection.',
  type: 'event_websocket_close',
  category: 'Events',
  label: 'On WebSocket Close',
  color: '#0ea5e9',
  gatewayEvent: 'WEBSOCKET_CLOSE',
  inputs: [{ id: 'filter_connection_id', label: 'Filter Connection ID', type: 'string', defaultValue: '', description: "Only handle events from this connection ID. Leave blank for all connections."}],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Runs when a WebSocket connection closes."},
    { id: 'connection_id', label: 'Connection ID', type: 'string', eventPath: 'connectionId', description: "ID of the WebSocket connection."},
    { id: 'code', label: 'Code', type: 'number', eventPath: 'code', description: "Invite code."},
    { id: 'reason', label: 'Reason', type: 'string', eventPath: 'reason', description: "Reason recorded with the audit log entry."},
    { id: 'was_clean', label: 'Was Clean', type: 'boolean', eventPath: 'wasClean', description: "Whether the WebSocket connection closed cleanly."}
  ]
};
