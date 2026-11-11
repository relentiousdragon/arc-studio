export default {
  description: 'Opens a WebSocket connection to a public host and waits until it is ready.',
  type: 'action_websocket_connect',
  category: 'Web & Network',
  label: 'Connect WebSocket',
  color: '#0ea5e9',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts opening the WebSocket connection." },
    { id: 'connection_id', label: 'Connection ID', type: 'string', defaultValue: 'main', description: "ID to assign to the new connection." },
    { id: 'url', label: 'WebSocket URL', type: 'string', defaultValue: '', description: "Public WebSocket URL to connect to." },
    { id: 'protocols', label: 'Protocols', type: 'string', defaultValue: '', description: "Optional WebSocket subprotocols." },
    { id: 'timeout_ms', label: 'Connect Timeout (ms)', type: 'number', defaultValue: 10000, description: "Maximum time to wait for the connection to open, in milliseconds." }
  ],
  outputs: [
    { id: 'exec', label: 'Connected', type: 'exec', description: "Runs when the connection opens." },
    { id: 'failure_exec', label: 'Failed', type: 'exec', description: "Runs when the connection cannot be opened." },
    { id: 'connection_id_out', label: 'Connection ID', type: 'string', description: "ID assigned to the opened connection." },
    { id: 'success', label: 'Connected', type: 'boolean', description: "True when the connection opened successfully." },
    { id: 'error', label: 'Error', type: 'string', description: "Error message, if the connection could not be opened." }
  ]
};
