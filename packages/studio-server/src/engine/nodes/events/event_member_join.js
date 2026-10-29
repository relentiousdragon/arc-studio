export default {
  "description": "Fires when a new user joins a guild",
  "type": "event_member_join",
  "category": "Events",
  "label": "On Member Joined",
  "color": "#5865F2",
  "gatewayEvent": "GUILD_MEMBER_ADD",
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
      "type": "string"
    },
    {
      "id": "username",
      "label": "Username",
      "type": "string"
    },
    {
      "id": "guild_id",
      "label": "Guild ID",
      "type": "string"
    }
  ]
};
