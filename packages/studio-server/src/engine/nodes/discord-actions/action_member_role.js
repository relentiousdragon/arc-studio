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
      "type": "exec",
      description: "Starts Set Member Role."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the server containing the member."},
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the member whose role will change."},
    {
      "id": "role_id",
      "label": "Role ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the role to assign or remove."},
    {
      "id": "operation",
      "label": "Operation",
      "type": "string",
      "defaultValue": "add",
      description: "Change to apply."},
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
      description: "Continues after Set Member Role completes."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
