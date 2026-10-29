export default {
  "description": "Changes a channel name, topic, or category. Requires Manage Channels.",
  "type": "action_edit_channel",
  "category": "Discord Actions",
  "label": "Edit Channel",
  "color": "#10b981",
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
      "id": "name",
      "label": "Name",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "topic",
      "label": "Topic",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "parent_id",
      "label": "Category ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "permission_overwrites",
      "label": "Permission Overwrites",
      "type": "object",
      "defaultValue": []
    },
    {
      "id": "rate_limit_per_user",
      "label": "Slowmode (seconds)",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "nsfw",
      "label": "Age restricted",
      "type": "boolean",
      "defaultValue": false
    },
    {
      "id": "bitrate",
      "label": "Voice bitrate",
      "type": "number",
      "defaultValue": 64000
    },
    {
      "id": "user_limit",
      "label": "Voice user limit",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "rtc_region",
      "label": "Voice region",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "video_quality_mode",
      "label": "Voice video quality mode",
      "type": "number",
      "defaultValue": ""
    },
    {
      "id": "default_auto_archive_duration",
      "label": "Thread auto archive (minutes)",
      "type": "number",
      "defaultValue": ""
    },
    {
      "id": "archived",
      "label": "Archived",
      "type": "boolean",
      "defaultValue": false
    },
    {
      "id": "locked",
      "label": "Locked",
      "type": "boolean",
      "defaultValue": false
    },
    {
      "id": "invitable",
      "label": "Members can invite",
      "type": "boolean",
      "defaultValue": true
    },
    {
      "id": "auto_archive_duration",
      "label": "Thread auto archive (minutes)",
      "type": "number",
      "defaultValue": 1440
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
      "id": "channel_id_out",
      "label": "Channel ID",
      "type": "string"
    }
  ]
};
