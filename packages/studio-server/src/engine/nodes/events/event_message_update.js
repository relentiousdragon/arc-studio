export default {
  "description": "A message is edited",
  "type": "event_message_update",
  "category": "Events",
  "label": "On Message Updated",
  "color": "#5865F2",
  "gatewayEvent": "MESSAGE_UPDATE",
  "gatewayIntents": [
    "GUILD_MESSAGES",
    "DIRECT_MESSAGES",
    "MESSAGE_CONTENT"
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
      "label": "Message Payload (May Be Partial)",
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
    },
    {
      "id": "author_id",
      "label": "Author ID",
      "type": "string",
      "eventPath": "author.id"
    },
    {
      "id": "content",
      "label": "Content",
      "type": "string",
      "eventPath": "content"
    },
    {
      "id": "edited_timestamp",
      "label": "Edited At",
      "type": "string",
      "eventPath": "edited_timestamp"
    }
  ]
};
