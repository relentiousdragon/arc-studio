export default {
  "description": "Updates bot status, optional activity, and optional custom status",
  "type": "action_set_presence",
  "category": "Discord Actions",
  "label": "Set Presence",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts Set Presence."},
    {
      "id": "status",
      "label": "Status (online/dnd/idle)",
      "type": "string",
      "defaultValue": "online",
      description: "Presence status to set. Use blank to clear it when supported."},
    {
      "id": "activity_text",
      "label": "Activity Text",
      "type": "string",
      "defaultValue": "ARC Studio",
      description: "Text to show in the bot activity."},
    {
      "id": "activity_type",
      "label": "Activity Type",
      "type": "number",
      "defaultValue": 0,
      description: "Discord activity type value."},
    {
      "id": "stream_url",
      "label": "Stream URL",
      "type": "string",
      "defaultValue": "",
      description: "URL for the streaming activity."},
    {
      "id": "custom_status_text",
      "label": "Custom Status",
      "type": "string",
      "defaultValue": "",
      description: "Text for the bot custom status."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after Set Presence completes."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
