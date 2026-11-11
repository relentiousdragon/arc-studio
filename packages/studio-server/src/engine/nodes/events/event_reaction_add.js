export default {
  "description": "A user adds a reaction",
  "type": "event_reaction_add",
  "category": "Events",
  "label": "On Reaction Added",
  "color": "#5865F2",
  "gatewayEvent": "MESSAGE_REACTION_ADD",
  "gatewayIntents": [
    "GUILD_MESSAGE_REACTIONS",
    "DIRECT_MESSAGE_REACTIONS"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when a user adds a reaction."},
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "eventPath": "user_id",
      description: "ID of the user who triggered or was affected by the event."},
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
      description: "ID of the server where the event occurred."},
    {
      "id": "emoji_id",
      "label": "Emoji ID",
      "type": "string",
      "eventPath": "emoji.id",
      description: "ID of the custom emoji, or empty for a Unicode emoji."},
    {
      "id": "emoji_name",
      "label": "Emoji Name",
      "type": "string",
      "eventPath": "emoji.name",
      description: "Name of the emoji used in the reaction."}
  ]
};
