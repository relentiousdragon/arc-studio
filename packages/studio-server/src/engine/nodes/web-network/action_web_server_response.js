export default {
  type: 'action_web_server_response',
  category: 'Web & Network',
  label: 'Respond to Web Request',
  description: 'Send the response for an On Web Request event. Use If / Else to choose status, content type, headers, and body.',
  color: '#0ea5e9',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts sending the HTTP response." },
    { id: 'request_id', label: 'Request ID', type: 'string', description: "ID of the request to respond to." },
    { id: 'status', label: 'Status', type: 'number', defaultValue: 200, description: "HTTP status code to send." },
    { id: 'content_type', label: 'Content Type', type: 'string', defaultValue: 'application/json; charset=utf-8', description: "MIME type of the response body." },
    { id: 'headers_json', label: 'Headers (JSON)', type: 'string', defaultValue: '{}', description: "Response headers encoded as a JSON object." },
    { id: 'body', label: 'Body', type: 'any', defaultValue: '', description: "Response body sent to the requester." }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after the response is handled." },
    { id: 'responded', label: 'Responded', type: 'boolean', description: "True when the response was sent." },
    { id: 'error', label: 'Error', type: 'string', description: "Error message, if the response could not be sent." }
  ]
};