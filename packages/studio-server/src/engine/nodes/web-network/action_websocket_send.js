export default {
  description: 'Sends text or base64 encoded binary data through an open WebSocket connection.',
  type: 'action_websocket_send',
  category: 'Web & Network',
  label: 'Send WebSocket Message',
  color: '#0ea5e9',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'connection_id', label: 'Connection ID', type: 'string', defaultValue: 'main' },
    { id: 'data', label: 'Message', type: 'string', defaultValue: '' },
    { id: 'is_binary', label: 'Send as Binary', type: 'boolean', defaultValue: false }
  ],
  outputs: [
    { id: 'exec', label: 'Sent', type: 'exec' },
    { id: 'failure_exec', label: 'Failed', type: 'exec' },
    { id: 'success', label: 'Sent', type: 'boolean' },
    { id: 'error', label: 'Error', type: 'string' }
  ]
};
