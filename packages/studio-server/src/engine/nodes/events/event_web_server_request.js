export default {
  description: 'Fires when an HTTP request matches this route. Connect Server ID from Start Web Server, then use If / Else and Respond to Web Request to build the handler.',
  type: 'event_web_server_request',
  category: 'Events',
  label: 'On Web Request',
  color: '#0ea5e9',
  gatewayEvent: 'WEB_SERVER_REQUEST',
  gatewayIntents: [],
  editorControls: [
    { type: 'select', key: 'method', label: 'HTTP Method', defaultValue: 'GET', options: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((value) => ({ value, label: value })) },
    { type: 'text', key: 'path', label: 'Route Path', defaultValue: '/api/:id', placeholder: '/api/:id' },
    { type: 'text', key: 'auth_token', label: 'Bearer Token', defaultValue: '', placeholder: '{{api_key}}', secret: true, template: true }
  ],
  inputs: [
    { id: 'web_server_id', label: 'Server ID', type: 'string', description: "Only handle requests from this web server ID."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Runs when an HTTP request matches this route."},
    { id: 'request_id', label: 'Request ID', type: 'string', eventPath: 'requestId', description: "Unique ID for this HTTP request."},
    { id: 'web_server_id', label: 'Server ID', type: 'string', eventPath: 'webServerId', description: "ID of the web server handling this request."},
    { id: 'method', label: 'HTTP Method', type: 'string', eventPath: 'method', description: "HTTP method used by the request."},
    { id: 'path', label: 'Path', type: 'string', eventPath: 'path', description: "Request path without the query string."},
    { id: 'query', label: 'Query', type: 'object', eventPath: 'query', description: "Text entered for the focused option."},
    { id: 'params', label: 'Path Parameters', type: 'object', eventPath: 'params', description: "Route parameters parsed from the request path."},
    { id: 'headers', label: 'Request Headers', type: 'object', eventPath: 'headers', description: "Headers sent with the request."},
    { id: 'body', label: 'Request Body', type: 'any', eventPath: 'body', description: "Body sent with the request."}
  ]
};