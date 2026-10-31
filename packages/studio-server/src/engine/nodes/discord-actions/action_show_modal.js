export default {
  "description": "Opens a configured Discord modal as the initial response to an interaction.",
  "type": "action_show_modal",
  "category": "Discord Actions",
  "label": "Show Popup Modal",
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
    },
    {
      "id": "modal",
      "label": "Modal",
      "type": "object"
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "success",
      "label": "Success",
      "type": "boolean"
    }
  ]
};
