export default {
  "description": "Requests a Gateway voice-state change. Joining does not create an audio connection or play audio.",
  "type": "action_voice_state",
  "category": "Discord Actions",
  "label": "Request Voice Join / Leave",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts Request Voice Join / Leave."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the server containing the voice channel."},
    {
      "id": "channel_id",
      "label": "Voice Channel ID (blank leaves)",
      "type": "string",
      "defaultValue": "",
      description: "Voice channel ID to join, or blank to leave voice."},
    {
      "id": "self_mute",
      "label": "Self Mute",
      "type": "boolean",
      "defaultValue": false,
      description: "Whether to join voice muted."},
    {
      "id": "self_deaf",
      "label": "Self Deafen",
      "type": "boolean",
      "defaultValue": false,
      description: "Whether to join voice deafened."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after Request Voice Join / Leave completes."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
