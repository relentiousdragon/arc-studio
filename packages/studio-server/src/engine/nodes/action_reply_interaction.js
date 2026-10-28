export default {
  "description": "Responds to an interaction within Discord’s 3 second initial response window, or edits a deferred response",
  "type": "action_reply_interaction",
  "category": "Discord Actions",
  "label": "Reply to Interaction",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "application_id",
      "label": "Application ID",
      "type": "string",
      "defaultValue": ""
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
      "id": "content",
      "label": "Reply Content",
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
      "id": "interaction_id",
      "label": "Interaction ID",
      "type": "string"
    },
    {
      "id": "application_id",
      "label": "Application ID",
      "type": "string"
    },
    {
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string"
    },
    {
      "id": "message_id",
      "label": "Message ID",
      "type": "string"
    },
    {
      "id": "message",
      "label": "Response Message",
      "type": "object"
    }
  ]
};
