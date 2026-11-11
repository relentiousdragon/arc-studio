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
      "type": "exec",
      description: "Starts Create Role."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the server to receive the new role."},
    {
      "id": "name",
      "label": "Name",
      "type": "string",
      "defaultValue": "new role",
      description: "Name to assign."},
    {
      "id": "color",
      "label": "Color (RGB number)",
      "type": "number",
      "defaultValue": 0,
      description: "Role color as an RGB integer."},
    {
      "id": "permissions",
      "label": "Permissions Bitfield",
      "type": "string",
      "defaultValue": "0",
      description: "Role permission bitfield."},
    {
      "id": "hoist",
      "label": "Show separately",
      "type": "boolean",
      "defaultValue": false,
      description: "Whether to show the role separately in the member list."},
    {
      "id": "mentionable",
      "label": "Mentionable",
      "type": "boolean",
      "defaultValue": false,
      description: "Whether users can mention the role."},
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
      description: "Continues after Create Role completes."},
    {
      "id": "role_id",
      "label": "Role ID",
      "type": "string",
      description: "ID of the created role."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
