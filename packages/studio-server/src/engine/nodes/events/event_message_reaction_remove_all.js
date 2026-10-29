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
      "type": "exec"
    },
    {
      "id": "message_id",
      "label": "Message ID",
      "type": "string",
      "eventPath": "message_id"
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
