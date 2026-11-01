export default {
  "description": "Writes an error message to the Studio console without stopping the graph.",
  "type": "action_console_error",
  "category": "Logic & Flow",
  "label": "Console Error",
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