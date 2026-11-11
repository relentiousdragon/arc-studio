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
      "type": "exec",
      description: "Starts Moderate Member."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the server containing the member to moderate."},
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the member to moderate."},
    {
      "id": "operation",
      "label": "Action",
      "type": "string",
      "defaultValue": "timeout",
      description: "Change to apply."},
    {
      "id": "duration_minutes",
      "label": "Timeout (minutes)",
      "type": "number",
      "defaultValue": 10,
      description: "Timeout length in minutes."},
    {
      "id": "delete_message_seconds",
      "label": "Ban message deletion (seconds)",
      "type": "number",
      "defaultValue": 0,
      description: "Recent message history to delete, in seconds."},
    {
      "id": "reason",
      "label": "Reason",
      "type": "string",
      "defaultValue": "",
      description: "Reason recorded in the audit log."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Succeeded",
      "type": "exec",
      description: "Continues after Moderate Member completes."},
    {
      "id": "failure_exec",
      "label": "Failed",
      "type": "exec",
      description: "Runs when Discord rejects the moderation action."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."},
    {
      "id": "error",
      "label": "Error",
      "type": "string",
      description: "Error message returned when the action fails."}
  ]
};
