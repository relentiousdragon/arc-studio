export default {
  "description": "A message is deleted",
  "type": "event_message_delete",
  "category": "Events",
  "label": "On Message Deleted",
  "color": "#5865F2",
  "gatewayEvent": "MESSAGE_DELETE",
  "gatewayIntents": [
    "GUILD_MESSAGES",
    "DIRECT_MESSAGES"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when a message is deleted."},
    {
      "id": "message",
      "label": "Deleted Message Payload",
      "type": "object",
      "eventPath": "$",
      description: "The deleted message payload, when available."},
    {
      "id": "message_id",
      "label": "Message ID",
      "type": "string",
      "eventPath": "id",
      description: "ID of the message tied to this event."},
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
      description: "ID of the server where the event occurred."}
  ]
};
