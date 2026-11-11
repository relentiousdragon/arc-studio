export default {
  description: 'Sends text or base64 encoded binary data through an open WebSocket connection.',
  type: 'action_websocket_send',
  category: 'Web & Network',
  label: 'Send WebSocket Message',
  color: '#0ea5e9',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts sending data through the WebSocket." },
    { id: 'connection_id', label: 'Connection ID', type: 'string', defaultValue: 'main', description: "ID of the open WebSocket connection to send through." },
    { id: 'data', label: 'Message', type: 'string', defaultValue: '', description: "Text or base64 encoded binary data to send." },
    { id: 'is_binary', label: 'Send as Binary', type: 'boolean', defaultValue: false, description: "Send the message as base64 encoded binary data." }
  ],
  outputs: [
    { id: 'exec', label: 'Sent', type: 'exec', description: "Runs when the message is sent." },
    { id: 'failure_exec', label: 'Failed', type: 'exec', description: "Runs when the message cannot be sent." },
    { id: 'success', label: 'Sent', type: 'boolean', description: "True when the message was sent." },
    { id: 'error', label: 'Error', type: 'string', description: "Error message, if the message could not be sent." }
  ]
};
