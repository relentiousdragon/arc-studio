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
      "type": "exec"
    },
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "eventPath": "user.id"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id"
    }
  ]
};
