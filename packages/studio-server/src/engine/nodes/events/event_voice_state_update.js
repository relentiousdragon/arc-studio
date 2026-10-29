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
      "type": "exec"
    },
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "eventPath": "user_id"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id"
    },
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "channel_id"
    },
    {
      "id": "session_id",
      "label": "Session ID",
      "type": "string",
      "eventPath": "session_id"
    },
    {
      "id": "self_muted",
      "label": "Self Muted",
      "type": "boolean",
      "eventPath": "self_mute"
    },
    {
      "id": "self_deafened",
      "label": "Self Deafened",
      "type": "boolean",
      "eventPath": "self_deaf"
    },
    {
      "id": "self_stream",
      "label": "Self Streaming",
      "type": "boolean",
      "eventPath": "self_stream"
    }
  ]
};
