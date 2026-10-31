export default {
  "description": "Adds or removes a role from a guild member. Requires Manage Roles.",
  "type": "action_member_role",
  "category": "Discord Actions",
  "label": "Set Member Role",
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
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "role_id",
      "label": "Role ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "operation",
      "label": "Operation",
      "type": "string",
      "defaultValue": "add"
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
      "id": "success",
      "label": "Success",
      "type": "boolean"
    }
  ]
};
