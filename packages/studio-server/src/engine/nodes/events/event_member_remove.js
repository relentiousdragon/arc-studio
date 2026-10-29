export default {
  "description": "A user leaves a server",
  "type": "event_member_remove",
  "category": "Events",
  "label": "On Member Left",
  "color": "#5865F2",
  "gatewayEvent": "GUILD_MEMBER_REMOVE",
  "gatewayIntents": [
    "GUILD_MEMBERS"
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
