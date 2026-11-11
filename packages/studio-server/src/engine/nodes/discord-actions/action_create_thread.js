export default {
  "description": "Creates a public or private thread inside a text channel. Requires the matching thread permission.",
  "createdAt": "2026-10-21T00:00:00.000Z",
  "type": "action_create_thread",
  "category": "Discord Actions",
  "label": "Create Thread",
  "color": "#10b981",
  "inferredPermissions": [
    "View Channels",
    "Create Public Threads",
    "Create Private Threads"
  ],
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts Create Thread."},
    {
      "id": "channel_id",
      "label": "Parent Channel ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the channel where the thread will be created."},
    {
      "id": "message_id",
      "label": "Message ID (Optional)",
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
      "id": "thread_type",
      "label": "Thread Type",
      "type": "number",
      "defaultValue": 11,
      description: "Discord thread type value."},
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
      "id": "invitable",
      "label": "Members Can Invite",
      "type": "boolean",
      "defaultValue": true,
      description: "Whether thread members can invite others."},
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
      description: "Continues after Create Thread completes."},
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
