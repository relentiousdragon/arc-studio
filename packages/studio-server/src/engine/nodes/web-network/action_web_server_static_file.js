export default {
  type: 'action_web_server_static_file',
  category: 'Web & Network',
  label: 'Serve Web File',
  description: 'Serve one uploaded project media file at a URL path, including HTML, CSS, JavaScript, images, and safe EJS templates.',
  color: '#0ea5e9',
  createdAt: '2026-11-09T00:00:00.000Z',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts registering a static file route." },
    { id: 'web_server_id', label: 'Server ID', type: 'string', description: "ID of the running web server." },
    { id: 'path', label: 'URL Path', type: 'string', defaultValue: '/index.html', description: "URL path where the file is served." },
    { id: 'asset', label: 'Project Media File', type: 'string', defaultValue: '', description: "Uploaded project media file to serve." },
    { id: 'auth_token', label: 'Bearer Token', type: 'string', defaultValue: '', description: "Token required to access the file. Supports text templates and connected values." },
    { id: 'content_type', label: 'Content Type Override', type: 'string', defaultValue: '', description: "Optional MIME type override for the file." },
    { id: 'status', label: 'Response Status', type: 'number', defaultValue: 200, description: "HTTP status code returned for the file." },
    { id: 'headers_json', label: 'Response Headers (JSON)', type: 'string', defaultValue: '{}', description: "Response headers encoded as a JSON object." }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after the file route is registered." },
    { id: 'registered', label: 'Registered', type: 'boolean', description: "True when the file route was registered." },
    { id: 'error', label: 'Error', type: 'string', description: "Error message, if the file route could not be registered." }
  ]
};
