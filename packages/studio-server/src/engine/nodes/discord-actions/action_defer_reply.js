export default {
  "description": "Acknowledge a slash command now and send its reply later. Connect Reply to Interaction after this node.",
  "type": "action_defer_reply",
  "category": "Discord Actions",
  "label": "Defer Reply",
  "color": "#10b981",
  "dynamicPins": {
    "kind": "connected-interaction-outputs"
  },
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
      "id": "ephemeral",
      "label": "Ephemeral (Hidden)",
      "type": "boolean",
      "defaultValue": false
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
    },
    {
      "id": "interaction_id",
      "label": "Interaction ID",
      "type": "string"
    },
    {
      "id": "success",
      "label": "Success",
      "type": "boolean"
    }
  ]
};
