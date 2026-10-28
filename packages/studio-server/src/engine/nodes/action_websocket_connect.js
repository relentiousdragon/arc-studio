export default {
  description: 'Opens a WebSocket connection to a public host and waits until it is ready.',
  type: 'action_websocket_connect',
  category: 'Web & Network',
  label: 'Connect WebSocket',
  color: '#0ea5e9',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'connection_id', label: 'Connection ID', type: 'string', defaultValue: 'main' },
    { id: 'url', label: 'WebSocket URL', type: 'string', defaultValue: '' },
    { id: 'protocols', label: 'Protocols', type: 'string', defaultValue: '' },
    { id: 'timeout_ms', label: 'Connect Timeout (ms)', type: 'number', defaultValue: 10000 }
  ],
  outputs: [
    { id: 'exec', label: 'Connected', type: 'exec' },
    { id: 'failure_exec', label: 'Failed', type: 'exec' },
    { id: 'connection_id_out', label: 'Connection ID', type: 'string' },
    { id: 'success', label: 'Connected', type: 'boolean' },
    { id: 'error', label: 'Error', type: 'string' }
  ]
};
