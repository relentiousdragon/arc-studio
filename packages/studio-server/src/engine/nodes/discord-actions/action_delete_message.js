export default {
  "description": "Deletes a message from a channel. Requires Manage Messages to delete messages from other users.",
  "type": "action_delete_message",
  "category": "Discord Actions",
  "label": "Delete Message",
  "color": "#ef4444",
  "inferredPermissions": [
    "Manage Messages"
  ],
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
      "id": "message_id",
      "label": "Message ID",
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
      "id": "success",
      "label": "Success",
      "type": "boolean"
    }
  ]
};

