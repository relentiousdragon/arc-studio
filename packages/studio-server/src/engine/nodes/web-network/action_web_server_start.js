export default {
  type: 'action_web_server_start',
  category: 'Web & Network',
  label: 'Start Web Server',
  description: 'Start a project-scoped HTTP server. Bind Host must be localhost or an IP address. Add route and static file nodes after it to serve paths.',
  color: '#0ea5e9',
  createdAt: '2026-11-09T00:00:00.000Z',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts the project web server." },
    { id: 'port', label: 'Port (0 for automatic)', type: 'number', defaultValue: 3001, description: "Port to bind, or zero to choose an available port." },
    { id: 'host', label: 'Bind Host (IP or localhost)', type: 'string', defaultValue: '127.0.0.1', description: "Local IP address or localhost to bind to." },
    { id: 'path', label: 'Legacy Fallback Route Path', type: 'string', defaultValue: '/', description: "Legacy fallback URL path." },
    { id: 'method', label: 'Legacy Fallback HTTP Method', type: 'string', defaultValue: 'GET', description: "HTTP method accepted by the legacy fallback route." },
    { id: 'status', label: 'Legacy Fallback Response Status', type: 'number', defaultValue: 200, description: "HTTP status code returned by the legacy fallback route." },
    { id: 'content_type', label: 'Legacy Fallback Content Type', type: 'string', defaultValue: 'text/html; charset=utf-8', description: "MIME type returned by the legacy fallback route." },
    { id: 'template', label: 'Legacy Fallback Response Template', type: 'string', defaultValue: '<h1>Hello <%= query.name %></h1>', description: "Response template for the legacy fallback route." },
    { id: 'routes_json', label: 'Legacy Routes JSON', type: 'string', defaultValue: '[]', description: "Legacy API route definitions encoded as JSON." },
    { id: 'files_json', label: 'Legacy Static Files JSON', type: 'string', defaultValue: '{}', description: "Legacy static file definitions encoded as JSON." }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after the web server starts." },
    { id: 'started', label: 'Started', type: 'boolean', description: "True when the web server starts successfully." },
    { id: 'port', label: 'Active Port', type: 'number', description: "Port assigned to the running server." },
    { id: 'web_server_id', label: 'Server ID', type: 'string', description: "ID used to add routes or stop this web server." },
    { id: 'url', label: 'Local URL', type: 'string', description: "Local URL of the running web server." },
    { id: 'error', label: 'Error', type: 'string', description: "Error message, if the web server could not start." }
  ]
};
