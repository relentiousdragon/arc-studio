export default {
  "description": "Creates a role with a name, RGB color number, and mentionable setting. Requires Manage Roles.",
  "type": "action_create_role",
  "category": "Discord Actions",
  "label": "Create Role",
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
      "defaultValue": "new role"
    },
    {
      "id": "color",
      "label": "Color (RGB number)",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "permissions",
      "label": "Permissions Bitfield",
      "type": "string",
      "defaultValue": "0"
    },
    {
      "id": "hoist",
      "label": "Show separately",
      "type": "boolean",
      "defaultValue": false
    },
    {
      "id": "mentionable",
      "label": "Mentionable",
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
      "id": "role_id",
      "label": "Role ID",
      "type": "string"
    },
    {
      "id": "success",
      "label": "Success",
      "type": "boolean"
    }
  ]
};
