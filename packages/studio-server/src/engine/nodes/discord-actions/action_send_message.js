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
      "type": "exec"
    },
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "thread_id",
      "label": "Thread ID (Optional)",
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
    },
    {
      "id": "file_data",
      "label": "File Data URL / Base64",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "file_name",
      "label": "File Name",
      "type": "string",
      "defaultValue": "image.png"
    },
    {
      "id": "reply_to_message_id",
      "label": "Reply to Message ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "mention_replied_user",
      "label": "Mention Replied User",
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
      "id": "message_id",
      "label": "Message ID",
      "type": "string"
    },
    {
      "id": "success",
      "label": "Success",
      "type": "boolean"
    }
  ]
};
