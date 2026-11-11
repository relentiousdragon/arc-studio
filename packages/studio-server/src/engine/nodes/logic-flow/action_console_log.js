export default {
  description: 'Writes a message to the Studio console at info level.',
  type: 'action_console_log',
  category: 'Logic & Flow',
  label: 'Console Log',
  color: '#8b5cf6',
  defaultData: {
    message: ''
  },
  editorControls: [
    { key: 'message', label: 'Message', type: 'text', placeholder: 'Message to log' }
  ],
  inputs: [
    {
      id: 'exec',
      label: 'Exec',
      type: 'exec',
      description: "Writes the message to the info log."
    },
    {
      id: 'message',
      label: 'Message',
      type: 'string',
      defaultValue: '',
      description: "Text to write to the Studio console."
    }
  ],
  outputs: [
    {
      id: 'exec',
      label: 'Exec',
      type: 'exec',
      description: "Continues after the message is logged."
    }
  ]
};
