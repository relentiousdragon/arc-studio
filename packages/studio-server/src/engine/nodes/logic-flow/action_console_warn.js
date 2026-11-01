export default {
  "description": "Writes a warning message to the Studio console.",
  "type": "action_console_warn",
  "category": "Logic & Flow",
  "label": "Console Warn",
  "color": "#8b5cf6",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "message",
      "label": "Message",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    }
  ]
};