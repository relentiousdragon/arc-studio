export default {
  "description": "Sets or clears a voice channel status. Requires Set Voice Channel Status, Manage Channels may also be required.",
  "type": "action_voice_channel_status",
  "category": "Discord Actions",
  "label": "Set Voice Channel Status",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "channel_id",
      "label": "Voice Channel ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "status",
      "label": "Status (blank clears)",
      "type": "string",
      "defaultValue": ""
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
