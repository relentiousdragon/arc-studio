export default {
  "description": "A user starts typing",
  "type": "event_typing_start",
  "category": "Events",
  "label": "On Typing Started",
  "color": "#5865F2",
  "gatewayEvent": "TYPING_START",
  "gatewayIntents": [
    "GUILD_MESSAGE_TYPING"
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
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "channel_id"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id"
    },
    {
      "id": "timestamp",
      "label": "Timestamp",
      "type": "number",
      "eventPath": "timestamp"
    }
  ]
};
