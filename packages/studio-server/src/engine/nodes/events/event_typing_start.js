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
      "type": "exec",
      description: "Runs when a user starts typing."},
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "eventPath": "user_id",
      description: "ID of the user who triggered or was affected by the event."},
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "channel_id",
      description: "ID of the channel where the event occurred."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."},
    {
      "id": "timestamp",
      "label": "Timestamp",
      "type": "number",
      "eventPath": "timestamp",
      description: "Time when the event occurred."}
  ]
};
