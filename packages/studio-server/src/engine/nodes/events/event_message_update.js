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
      "type": "exec",
      description: "Runs when a message is edited."},
    {
      "id": "message",
      "label": "Message Payload (May Be Partial)",
      "type": "object",
      "eventPath": "$",
      description: "The updated message payload, which may be partial."},
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
      description: "ID of the server where the event occurred."},
    {
      "id": "author_id",
      "label": "Author ID",
      "type": "string",
      "eventPath": "author.id",
      description: "ID of the message author."},
    {
      "id": "content",
      "label": "Content",
      "type": "string",
      "eventPath": "content",
      description: "Text content of the message."},
    {
      "id": "edited_timestamp",
      "label": "Edited At",
      "type": "string",
      "eventPath": "edited_timestamp",
      description: "Time when the message was last edited."}
  ]
};
