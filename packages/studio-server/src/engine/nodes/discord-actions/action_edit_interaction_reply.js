export default {
  "description": "Edits the original reply to a slash command, button, or select menu interaction after it has already been sent",
  "type": "action_edit_interaction_reply",
  "category": "Discord Actions",
  "label": "Edit Interaction Reply",
  "color": "#f59e0b",
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
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "content",
      "label": "New Content (Optional)",
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
    }
  ]
};
