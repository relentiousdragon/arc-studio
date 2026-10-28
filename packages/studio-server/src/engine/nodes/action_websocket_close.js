export default {
  description: 'Closes an open WebSocket connection.',
  type: 'action_websocket_close',
  category: 'Web & Network',
  label: 'Close WebSocket',
  color: '#0ea5e9',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'connection_id', label: 'Connection ID', type: 'string', defaultValue: 'main' },
    { id: 'code', label: 'Close Code', type: 'number', defaultValue: 1000 },
    { id: 'reason', label: 'Reason', type: 'string', defaultValue: '' }
  ],
  outputs: [
    { id: 'exec', label: 'Closed', type: 'exec' },
    { id: 'failure_exec', label: 'Failed', type: 'exec' },
    { id: 'success', label: 'Closed', type: 'boolean' },
    { id: 'error', label: 'Error', type: 'string' }
  ]
};
