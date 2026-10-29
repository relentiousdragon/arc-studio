export default {
  "description": "A user is unbanned from a server",
  "type": "event_guild_ban_remove",
  "category": "Events",
  "label": "On User Unbanned",
  "color": "#5865F2",
  "gatewayEvent": "GUILD_BAN_REMOVE",
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
