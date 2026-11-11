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
      "type": "exec",
      description: "Runs when a new user joins a guild."},
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      description: "ID of the user who triggered or was affected by the event."},
    {
      "id": "username",
      "label": "Username",
      "type": "string",
      description: "Username of the user who triggered the event."},
    {
      "id": "guild_id",
      "label": "Guild ID",
      "type": "string",
      description: "ID of the server where the event occurred."}
  ]
};
