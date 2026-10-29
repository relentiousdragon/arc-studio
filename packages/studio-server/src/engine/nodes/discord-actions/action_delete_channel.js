export default {
  "description": "Permanently deletes a channel. This cannot be undone. Requires Manage Channels.",
  "type": "action_delete_channel",
  "category": "Discord Actions",
  "label": "Delete Channel",
  "color": "#ef4444",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "reason",
      "label": "Audit Log Reason",
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
      "id": "deleted_channel_id",
      "label": "Deleted Channel ID",
      "type": "string"
    }
  ]
};
