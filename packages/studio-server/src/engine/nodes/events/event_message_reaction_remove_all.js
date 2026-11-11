export default {
  "description": "All reactions are removed from a message",
  "type": "event_message_reaction_remove_all",
  "category": "Events",
  "label": "On All Reactions Removed",
  "color": "#5865F2",
  "gatewayEvent": "MESSAGE_REACTION_REMOVE_ALL",
  "gatewayIntents": [
    "GUILD_MESSAGE_REACTIONS"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when all reactions are removed from a message."},
    {
      "id": "message_id",
      "label": "Message ID",
      "type": "string",
      "eventPath": "message_id",
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
