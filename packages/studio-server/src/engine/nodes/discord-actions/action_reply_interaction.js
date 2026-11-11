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
      "type": "exec",
      description: "Starts Reply to Interaction."},
    {
      "id": "application_id",
      "label": "Application ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the application that owns the interaction."},
    {
      "id": "interaction_id",
      "label": "Interaction ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the interaction to respond to."},
    {
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string",
      "defaultValue": "",
      description: "Token used to respond to the interaction."},
    {
      "id": "content",
      "label": "Reply Content",
      "type": "string",
      "defaultValue": "",
      description: "Text to include in the interaction reply."},
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
      description: "Files to attach to the message."},
    {
      "id": "ephemeral",
      "label": "Ephemeral (Hidden)",
      "type": "boolean",
      "defaultValue": false,
      description: "Whether to hide the interaction response from other users."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after Reply to Interaction completes."},
    {
      "id": "interaction_id",
      "label": "Interaction ID",
      "type": "string",
      description: "ID of the interaction that was handled."},
    {
      "id": "application_id",
      "label": "Application ID",
      "type": "string",
      description: "ID of the application that owns the interaction."},
    {
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string",
      description: "Token used to continue responding to the interaction."},
    {
      "id": "message_id",
      "label": "Message ID",
      "type": "string",
      description: "ID of the message created by the action."},
    {
      "id": "message",
      "label": "Response Message",
      "type": "object",
      description: "Message created as the interaction reply."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
