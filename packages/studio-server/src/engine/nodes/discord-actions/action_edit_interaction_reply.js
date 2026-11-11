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
      "type": "exec",
      description: "Starts Edit Interaction Reply."},
    {
      "id": "application_id",
      "label": "Application ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the application that owns the interaction."},
    {
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string",
      "defaultValue": "",
      description: "Token used to respond to the interaction."},
    {
      "id": "content",
      "label": "New Content (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Replacement text for the original interaction reply."},
    {
      "id": "embed",
      "label": "Embed (Optional)",
      "type": "embed",
      description: "Embed to include with the message."},
    {
      "id": "components",
      "label": "Components (Optional)",
      "type": "object",
      description: "Message components to send or update."},
    {
      "id": "files",
      "label": "Files (optional)",
      "type": "object",
      "defaultValue": [],
      description: "Files to attach to the message."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after Edit Interaction Reply completes."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
