export default {
  "description": "Updates bot status, optional activity, and optional custom status",
  "type": "action_set_presence",
  "category": "Discord Actions",
  "label": "Set Presence",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "status",
      "label": "Status (online/dnd/idle)",
      "type": "string",
      "defaultValue": "online"
    },
    {
      "id": "activity_text",
      "label": "Activity Text",
      "type": "string",
      "defaultValue": "ARC Studio"
    },
    {
      "id": "activity_type",
      "label": "Activity Type",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "stream_url",
      "label": "Stream URL",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "custom_status_text",
      "label": "Custom Status",
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
      "id": "success",
      "label": "Success",
      "type": "boolean"
    }
  ]
};
