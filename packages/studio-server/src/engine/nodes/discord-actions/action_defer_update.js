export default {
  "description": "Acknowledge a button or select interaction now and update its message later. Connect Reply to Interaction after this node.",
  "type": "action_defer_update",
  "category": "Discord Actions",
  "label": "Defer Update",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "interaction_id",
      "label": "Interaction ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string"
    }
  ]
};
