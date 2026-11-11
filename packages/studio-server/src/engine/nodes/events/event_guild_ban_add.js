export default {
  "description": "A user is banned from a server",
  "type": "event_guild_ban_add",
  "category": "Events",
  "label": "On User Banned",
  "color": "#5865F2",
  "gatewayEvent": "GUILD_BAN_ADD",
  "gatewayIntents": [
    "GUILD_MODERATION"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when a user is banned from a server."},
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "eventPath": "user.id",
      description: "ID of the user who triggered or was affected by the event."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."},
    {
      "id": "user",
      "label": "User",
      "type": "object",
      "eventPath": "user",
      description: "User data sent with the event."},
    {
      "id": "username",
      "label": "Username",
      "type": "string",
      "eventPath": "user.username",
      description: "User's account name."},
    {
      "id": "global_name",
      "label": "Display Name",
      "type": "string",
      "eventPath": "user.global_name",
      description: "User's display name, if set."},
    {
      "id": "bot",
      "label": "Is Bot",
      "type": "boolean",
      "eventPath": "user.bot",
      description: "Whether the user is a bot."}
  ]
};
