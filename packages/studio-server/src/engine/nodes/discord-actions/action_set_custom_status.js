export default {
  "description": "Deprecated. Custom status has moved to Set Presence.",
  "type": "action_set_custom_status",
  "category": "Discord Actions",
  "label": "Set Custom Status",
  "color": "#10b981",
  "hidden": true,
  "deprecationMessage": "Moved to Set Presence. Configure Custom Status there, then delete this node.",
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
    },
    {
      "id": "success",
      "label": "Success",
      "type": "boolean"
    }
  ]
};
