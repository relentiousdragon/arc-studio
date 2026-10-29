export default {
  "description": "Sets the bot profile status text",
  "type": "action_set_custom_status",
  "category": "Discord Actions",
  "label": "Set Custom Status",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "status_text",
      "label": "Status Text",
      "type": "string",
      "defaultValue": "ARC Studio"
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
