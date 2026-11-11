export default {
  "description": "A member joins, leaves, or changes voice state",
  "type": "event_voice_state_update",
  "category": "Events",
  "label": "On Voice State Changed",
  "color": "#5865F2",
  "gatewayEvent": "VOICE_STATE_UPDATE",
  "gatewayIntents": [
    "GUILD_VOICE_STATES"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when a member joins, leaves, or changes voice state."},
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "eventPath": "user_id",
      description: "ID of the user who triggered or was affected by the event."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."},
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "channel_id",
      description: "ID of the channel where the event occurred."},
    {
      "id": "session_id",
      "label": "Session ID",
      "type": "string",
      "eventPath": "session_id",
      description: "Voice session ID for the member."},
    {
      "id": "self_muted",
      "label": "Self Muted",
      "type": "boolean",
      "eventPath": "self_mute",
      description: "Whether the member muted themself."},
    {
      "id": "self_deafened",
      "label": "Self Deafened",
      "type": "boolean",
      "eventPath": "self_deaf",
      description: "Whether the member deafened themself."},
    {
      "id": "self_stream",
      "label": "Self Streaming",
      "type": "boolean",
      "eventPath": "self_stream",
      description: "Whether the member is sharing a stream."}
  ]
};
