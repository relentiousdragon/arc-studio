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
      "type": "exec"
    },
    {
      "id": "message",
      "label": "Deleted Message Payload",
      "type": "object",
      "eventPath": "$"
    },
    {
      "id": "message_id",
      "label": "Message ID",
      "type": "string",
      "eventPath": "id"
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
    }
  ]
};
