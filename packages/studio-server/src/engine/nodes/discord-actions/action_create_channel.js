export default {
  "description": "Creates a text, voice, category, announcement, stage, forum, or media channel. Requires Manage Channels.",
  "type": "action_create_channel",
  "category": "Discord Actions",
  "label": "Create Channel",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
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
      "id": "channel_type",
      "label": "Channel Type",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "category_id",
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
      "id": "topic",
      "label": "Topic",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "flags",
      "label": "Channel Flags",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "rate_limit_per_user",
      "label": "Slowmode (seconds)",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "bitrate",
      "label": "Bitrate (bits/sec)",
      "type": "number",
      "defaultValue": 64000
    },
    {
      "id": "user_limit",
      "label": "User Limit",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "position",
      "label": "Position",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "default_auto_archive_duration",
      "label": "Default Thread Archive (minutes)",
      "type": "number",
      "defaultValue": 1440
    },
    {
      "id": "available_tags",
      "label": "Forum Tags",
      "type": "object",
      "defaultValue": []
    },
    {
      "id": "nsfw",
      "label": "Age Restricted",
      "type": "boolean",
      "defaultValue": false
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
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string"
    },
    {
      "id": "success",
      "label": "Success",
      "type": "boolean"
    }
  ]
};
