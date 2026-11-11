export default {
  "description": "Sends message text, embeds, attachments, and interactive components to a Discord channel",
  "createdAt": "2026-10-21T00:00:00.000Z",
  "type": "action_send_message",
  "category": "Discord Actions",
  "label": "Send Message",
  "color": "#10b981",
  "inferredPermissions": [
    "View Channels",
    "Send Messages",
    "Send Messages in Threads"
  ],
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts Send Message."},
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the channel where the message will be sent."},
    {
      "id": "thread_id",
      "label": "Thread ID (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional thread ID where the message will be sent."},
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
      description: "Files to attach to the message."},
    {
      "id": "file_data",
      "label": "File Data URL / Base64",
      "type": "string",
      "defaultValue": "",
      description: "File contents as a data URL or base64 text."},
    {
      "id": "file_name",
      "label": "File Name",
      "type": "string",
      "defaultValue": "image.png",
      description: "File name shown for the uploaded attachment."},
    {
      "id": "reply_to_message_id",
      "label": "Reply to Message ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the message to reply to."},
    {
      "id": "mention_replied_user",
      "label": "Mention Replied User",
      "type": "boolean",
      "defaultValue": false,
      description: "Whether to mention the author of the replied message."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after Send Message completes."},
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
