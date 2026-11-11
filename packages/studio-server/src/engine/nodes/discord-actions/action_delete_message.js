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
      "type": "exec",
      description: "Starts Delete Message."},
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
      description: "ID of the message to delete."},
    {
      "id": "reason",
      "label": "Audit Log Reason",
      "type": "string",
      "defaultValue": "",
      description: "Reason recorded in the audit log."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after Delete Message completes."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
