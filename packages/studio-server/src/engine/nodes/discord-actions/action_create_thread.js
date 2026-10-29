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
      "label": "Message ID (Optional)",
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
      "id": "thread_type",
      "label": "Thread Type",
      "type": "string",
      "defaultValue": "public"
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
      "id": "invitable",
      "label": "Members Can Invite",
      "type": "boolean",
      "defaultValue": true
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
