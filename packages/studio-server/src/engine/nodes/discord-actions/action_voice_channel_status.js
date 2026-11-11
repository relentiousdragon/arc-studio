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
      "type": "exec",
      description: "Starts Set Voice Channel Status."},
    {
      "id": "channel_id",
      "label": "Voice Channel ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the voice channel to update."},
    {
      "id": "status",
      "label": "Status (blank clears)",
      "type": "string",
      "defaultValue": "",
      description: "Status text to set, or blank to clear the current status."},
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
      description: "Continues after Set Voice Channel Status completes."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
