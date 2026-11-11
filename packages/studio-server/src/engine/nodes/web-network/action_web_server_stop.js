export default {
  type: 'action_web_server_stop',
  category: 'Web & Network',
  label: 'Stop All Web Servers',
  description: 'Stop every web server started by this project.',
  color: '#0ea5e9',
  inputs: [{ id: 'exec', label: 'Exec', type: 'exec', description: "Stops every web server started by this project." }],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after the project web servers stop." },
    { id: 'stopped', label: 'Stopped Count', type: 'number', description: "Number of web servers stopped." },
    { id: 'error', label: 'Error', type: 'string', description: "Error message, if a web server could not be stopped." }
  ]
};
