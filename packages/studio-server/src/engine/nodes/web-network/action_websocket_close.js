export default {
  description: 'Closes an open WebSocket connection.',
  type: 'action_websocket_close',
  category: 'Web & Network',
  label: 'Close WebSocket',
  color: '#0ea5e9',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts closing the WebSocket connection." },
    { id: 'connection_id', label: 'Connection ID', type: 'string', defaultValue: 'main', description: "ID of the connection to close." },
    { id: 'code', label: 'Close Code', type: 'number', defaultValue: 1000, description: "WebSocket close code to send." },
    { id: 'reason', label: 'Reason', type: 'string', defaultValue: '', description: "Reason sent when closing the connection." }
  ],
  outputs: [
    { id: 'exec', label: 'Closed', type: 'exec', description: "Runs when the connection closes successfully." },
    { id: 'failure_exec', label: 'Failed', type: 'exec', description: "Runs when the connection cannot be closed." },
    { id: 'success', label: 'Closed', type: 'boolean', description: "True when the connection closed successfully." },
    { id: 'error', label: 'Error', type: 'string', description: "Error message, if the connection could not be closed." }
  ]
};
