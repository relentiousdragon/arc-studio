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
      "type": "exec",
      description: "Starts Edit Message."},
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the channel containing the message."},
    {
      "id": "message_id",
      "label": "Message ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the message to edit."},
    {
      "id": "content",
      "label": "Content",
      "type": "string",
      "defaultValue": "",
      description: "Message text to send or update."},
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
      description: "Continues after Edit Message completes."},
    {
      "id": "message_id",
      "label": "Message ID",
      "type": "string",
      description: "ID of the message created by the action."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
