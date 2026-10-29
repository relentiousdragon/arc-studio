export default {
  "description": "A user removes a reaction",
  "type": "event_reaction_remove",
  "category": "Events",
  "label": "On Reaction Removed",
  "color": "#5865F2",
  "gatewayEvent": "MESSAGE_REACTION_REMOVE",
  "gatewayIntents": [
    "GUILD_MESSAGE_REACTIONS",
    "DIRECT_MESSAGE_REACTIONS"
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
    },
    {
      "id": "emoji_id",
      "label": "Emoji ID",
      "type": "string",
      "eventPath": "emoji.id"
    },
    {
      "id": "emoji_name",
      "label": "Emoji Name",
      "type": "string",
      "eventPath": "emoji.name"
    }
  ]
};
