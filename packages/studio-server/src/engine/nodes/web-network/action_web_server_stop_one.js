export default {
  type: 'action_web_server_stop_one',
  category: 'Web & Network',
  label: 'Stop Web Server',
  description: 'Stop one web server in this project by its Server ID.',
  color: '#0ea5e9',
  createdAt: '2026-11-09T00:00:00.000Z',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Stops the selected project web server." },
    { id: 'web_server_id', label: 'Server ID', type: 'string', description: "ID of the web server to stop." }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after the web server stop is handled." },
    { id: 'stopped', label: 'Stopped', type: 'boolean', description: "True when the web server was stopped." },
    { id: 'error', label: 'Error', type: 'string', description: "Error message, if the web server could not be stopped." }
  ]
};
