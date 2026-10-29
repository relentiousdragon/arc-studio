export default {
  "description": "Times out, kicks, bans, or unbans a server member. Route failures through the Failed output.",
  "type": "action_moderate_member",
  "category": "Discord Actions",
  "label": "Moderate Member",
  "color": "#ef4444",
  "inferredPermissions": [
    "Moderate Members",
    "Kick Members",
    "Ban Members"
  ],
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
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "operation",
      "label": "Action",
      "type": "string",
      "defaultValue": "timeout"
    },
    {
      "id": "duration_minutes",
      "label": "Timeout (minutes)",
      "type": "number",
      "defaultValue": 10
    },
    {
      "id": "delete_message_seconds",
      "label": "Ban message deletion (seconds)",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "reason",
      "label": "Reason",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Succeeded",
      "type": "exec"
    },
    {
      "id": "failure_exec",
      "label": "Failed",
      "type": "exec"
    },
    {
      "id": "success",
      "label": "Success",
      "type": "boolean"
    },
    {
      "id": "error",
      "label": "Error",
      "type": "string"
    }
  ]
};
