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
      "type": "exec"
    },
    {
      "id": "audit_log_id",
      "label": "Audit Log Entry ID",
      "type": "string",
      "eventPath": "id"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id"
    },
    {
      "id": "action_type",
      "label": "Action Type ID",
      "type": "number",
      "eventPath": "action_type"
    },
    {
      "id": "target_id",
      "label": "Target ID",
      "type": "string",
      "eventPath": "target_id"
    },
    {
      "id": "user_id",
      "label": "Acting User ID",
      "type": "string",
      "eventPath": "user_id"
    },
    {
      "id": "reason",
      "label": "Reason",
      "type": "string",
      "eventPath": "reason"
    },
    {
      "id": "changes",
      "label": "Changes",
      "type": "array",
      "eventPath": "changes"
    },
    {
      "id": "options",
      "label": "Options",
      "type": "object",
      "eventPath": "options"
    },
    {
      "id": "entry",
      "label": "Full Audit Log Entry",
      "type": "object",
      "eventPath": "$"
    }
  ]
};
