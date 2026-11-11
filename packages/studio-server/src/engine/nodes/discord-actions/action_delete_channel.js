export default {
  "description": "Permanently deletes a channel. This cannot be undone. Requires Manage Channels.",
  "type": "action_delete_channel",
  "category": "Discord Actions",
  "label": "Delete Channel",
  "color": "#ef4444",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts Delete Channel."},
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the channel to delete."},
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
      description: "Continues after Delete Channel completes."},
    {
      "id": "deleted_channel_id",
      "label": "Deleted Channel ID",
      "type": "string",
      description: "ID of the channel deleted by the action."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
