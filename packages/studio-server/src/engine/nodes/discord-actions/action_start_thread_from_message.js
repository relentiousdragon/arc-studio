export default {
  "description": "Starts a public thread from an existing message in a text channel.",
  "createdAt": "2026-10-21T00:00:00.000Z",
  "type": "action_start_thread_from_message",
  "category": "Discord Actions",
  "label": "Start Thread from Message",
  "color": "#10b981",
  "inferredPermissions": [
    "View Channels",
    "Send Messages",
    "Create Public Threads"
  ],
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts Start Thread from Message."},
    {
      "id": "channel_id",
      "label": "Parent Channel ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the channel containing the message."},
    {
      "id": "message_id",
      "label": "Message ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the message to start a thread from."},
    {
      "id": "name",
      "label": "Thread Name",
      "type": "string",
      "defaultValue": "",
      description: "Name to assign."},
    {
      "id": "auto_archive_duration",
      "label": "Auto Archive (minutes)",
      "type": "number",
      "defaultValue": 1440,
      description: "Thread auto archive time in minutes."},
    {
      "id": "rate_limit_per_user",
      "label": "Slowmode (seconds)",
      "type": "number",
      "defaultValue": 0,
      description: "Slowmode delay in seconds."},
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
      description: "Continues after Start Thread from Message completes."},
    {
      "id": "thread_id",
      "label": "Thread ID",
      "type": "string",
      description: "ID of the thread created by the action."},
    {
      "id": "parent_channel_id",
      "label": "Parent Channel ID",
      "type": "string",
      description: "ID of the thread parent channel."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
