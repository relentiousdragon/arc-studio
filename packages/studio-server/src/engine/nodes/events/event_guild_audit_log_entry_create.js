export default {
  "description": "An audit log entry is created. Requires View Audit Log. Discord may merge channel or role position updates, and merged updates may not emit another event.",
  "type": "event_guild_audit_log_entry_create",
  "category": "Events",
  "label": "On Audit Log Entry Created",
  "color": "#5865F2",
  "gatewayEvent": "GUILD_AUDIT_LOG_ENTRY_CREATE",
  "gatewayIntents": [
    "GUILD_MODERATION"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when an audit log entry is created."},
    {
      "id": "audit_log_id",
      "label": "Audit Log Entry ID",
      "type": "string",
      "eventPath": "id",
      description: "ID of the audit log entry."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."},
    {
      "id": "action_type",
      "label": "Action Type ID",
      "type": "number",
      "eventPath": "action_type",
      description: "Discord audit log action type value."},
    {
      "id": "target_id",
      "label": "Target ID",
      "type": "string",
      "eventPath": "target_id",
      description: "ID of the object changed by the action."},
    {
      "id": "user_id",
      "label": "Acting User ID",
      "type": "string",
      "eventPath": "user_id",
      description: "ID of the user who triggered or was affected by the event."},
    {
      "id": "reason",
      "label": "Reason",
      "type": "string",
      "eventPath": "reason",
      description: "Reason recorded with the audit log entry."},
    {
      "id": "changes",
      "label": "Changes",
      "type": "array",
      "eventPath": "changes",
      description: "Fields changed in the audit log entry."},
    {
      "id": "options",
      "label": "Options",
      "type": "object",
      "eventPath": "options",
      description: "Arguments submitted with the command."},
    {
      "id": "entry",
      "label": "Full Audit Log Entry",
      "type": "object",
      "eventPath": "$",
      description: "Full audit log entry."}
  ]
};
