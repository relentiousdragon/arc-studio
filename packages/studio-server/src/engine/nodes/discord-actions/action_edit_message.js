export default {
  "description": "Edits the content, embed, or components of an existing Discord message",
  "type": "action_edit_message",
  "category": "Discord Actions",
  "label": "Edit Message",
  "color": "#10b981",
  "requiredIntents": [],
  "inferredPermissions": [
    "View Channels",
    "Send Messages"
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
      "id": "content",
      "label": "Content",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "embed",
      "label": "Embed (Optional)",
      "type": "embed"
    },
    {
      "id": "components",
      "label": "Components (Optional)",
      "type": "object"
    },
    {
      "id": "files",
      "label": "Files (optional)",
      "type": "object",
      "defaultValue": []
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "message_id",
      "label": "Message ID",
      "type": "string"
    }
  ]
};
