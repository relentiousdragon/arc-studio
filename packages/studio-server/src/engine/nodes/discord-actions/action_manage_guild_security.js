export default {
  "description": "Manages server raid safety and incident actions by pausing or resuming invites and direct messages",
  "type": "action_manage_guild_security",
  "category": "Discord Actions",
  "label": "Manage Server Security",
  "color": "#ef4444",
  "editorControls": [
    {
      "type": "select",
      "key": "action",
      "label": "Security Action",
      "defaultValue": "pause_both",
      "options": [
        { "value": "pause_both", "label": "Pause Invites & Direct Messages" },
        { "value": "pause_invites", "label": "Pause Invites Only" },
        { "value": "pause_dms", "label": "Pause Direct Messages Only" },
        { "value": "resume_both", "label": "Resume Invites & Direct Messages" },
        { "value": "resume_invites", "label": "Resume Invites Only" },
        { "value": "resume_dms", "label": "Resume Direct Messages Only" },
        { "value": "custom", "label": "Custom Security Timestamps" }
      ]
    }
  ],
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      "description": "Runs Manage Server Security."
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "defaultValue": "",
      "description": "ID of the server whose safety incident actions to update."
    },
    {
      "id": "action",
      "label": "Action",
      "type": "string",
      "defaultValue": "pause_both",
      "description": "Action to perform: pause_both, pause_invites, pause_dms, resume_both, resume_invites, resume_dms, or custom."
    },
    {
      "id": "duration_minutes",
      "label": "Duration (Minutes)",
      "type": "number",
      "defaultValue": 60,
      "description": "Minutes to pause for (1 to 1440, up to 24 hours)."
    },
    {
      "id": "invites_disabled_until",
      "label": "Invites Disabled Until",
      "type": "string",
      "defaultValue": "",
      "description": "Optional custom ISO 8601 timestamp for custom action mode."
    },
    {
      "id": "dms_disabled_until",
      "label": "DMs Disabled Until",
      "type": "string",
      "defaultValue": "",
      "description": "Optional custom ISO 8601 timestamp for custom action mode."
    },
    {
      "id": "reason",
      "label": "Reason (Optional)",
      "type": "string",
      "defaultValue": "",
      "description": "Audit log reason for server security action."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      "description": "Continues after security action completes."
    },
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      "description": "Whether the security action was applied successfully."
    },
    {
      "id": "invites_disabled_until",
      "label": "Invites Disabled Until",
      "type": "string",
      "description": "Timestamp until which invites are paused, or empty if active."
    },
    {
      "id": "dms_disabled_until",
      "label": "DMs Disabled Until",
      "type": "string",
      "description": "Timestamp until which DMs are paused, or empty if active."
    },
    {
      "id": "is_invites_paused",
      "label": "Invites Paused",
      "type": "boolean",
      "description": "True when server invites are currently disabled."
    },
    {
      "id": "is_dms_paused",
      "label": "DMs Paused",
      "type": "boolean",
      "description": "True when server direct messages are currently disabled."
    },
    {
      "id": "incident_data",
      "label": "Incident Data",
      "type": "object",
      "description": "Raw Discord incident actions response."
    }
  ]
};

