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
      "type": "exec"
    },
    {
      "id": "channel_id",
      "label": "Parent Channel ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "message_id",
      "label": "Message ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "name",
      "label": "Thread Name",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "auto_archive_duration",
      "label": "Auto Archive (minutes)",
      "type": "number",
      "defaultValue": 1440
    },
    {
      "id": "rate_limit_per_user",
      "label": "Slowmode (seconds)",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "reason",
      "label": "Audit Log Reason",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "thread_id",
      "label": "Thread ID",
      "type": "string"
    },
    {
      "id": "parent_channel_id",
      "label": "Parent Channel ID",
      "type": "string"
    }
  ]
};
