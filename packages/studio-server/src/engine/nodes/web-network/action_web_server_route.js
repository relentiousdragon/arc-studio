export default {
  type: 'action_web_server_route',
  category: 'Web & Network',
  label: 'Add Web Route',
  description: 'Register one API or page route on a started project web server. Route templates only read safe request values.',
  color: '#0ea5e9',
  createdAt: '2026-11-09T00:00:00.000Z',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts registering a route on the web server." },
    { id: 'web_server_id', label: 'Server ID', type: 'string', description: "ID of the running web server." },
    { id: 'method', label: 'HTTP Method', type: 'string', defaultValue: 'GET', description: "HTTP method accepted by the route." },
    { id: 'path', label: 'Path', type: 'string', defaultValue: '/api/hello', description: "URL path template for the route." },
    { id: 'status', label: 'Response Status', type: 'number', defaultValue: 200, description: "HTTP status code returned by the route." },
    { id: 'content_type', label: 'Content Type', type: 'string', defaultValue: 'application/json; charset=utf-8', description: "MIME type of the route response." },
    { id: 'headers_json', label: 'Response Headers (JSON)', type: 'string', defaultValue: '{}', description: "Response headers encoded as a JSON object." },
    { id: 'auth_token', label: 'Bearer Token', type: 'string', defaultValue: '', description: "Token required to access the route. Supports text templates and connected values." },
    { id: 'response', label: 'Response Template', type: 'string', defaultValue: '{"ok":true}', description: "Response template for the route." }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after the route is registered." },
    { id: 'registered', label: 'Registered', type: 'boolean', description: "True when the route was registered." },
    { id: 'error', label: 'Error', type: 'string', description: "Error message, if the route could not be registered." }
  ]
};
