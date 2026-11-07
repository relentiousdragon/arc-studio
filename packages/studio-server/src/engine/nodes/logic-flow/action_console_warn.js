export default {
  description: 'Writes a message to the Studio console at warn level.',
  type: 'action_console_warn',
  category: 'Logic & Flow',
  label: 'Console Warn',
  color: '#8b5cf6',
  defaultData: {
    message: ''
  },
  editorControls: [
    { key: 'message', label: 'Message', type: 'text', placeholder: 'Warning message to log' }
  ],
  inputs: [
    {
      id: 'exec',
      label: 'Exec',
      type: 'exec'
    },
    {
      id: 'message',
      label: 'Message',
      type: 'string',
      defaultValue: ''
    }
  ],
  outputs: [
    {
      id: 'exec',
      label: 'Exec',
      type: 'exec'
    }
  ]
};
