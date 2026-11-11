export default {
  "description": "The app becomes available in a server",
  "type": "event_guild_create",
  "category": "Events",
  "label": "On Server Available",
  "color": "#5865F2",
  "gatewayEvent": "GUILD_CREATE",
  "gatewayIntents": [
    "GUILDS"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when the app becomes available in a server."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "id",
      description: "ID of the server where the event occurred."},
    {
      "id": "name",
      "label": "Name",
      "type": "string",
      "eventPath": "name",
      description: "Current name of the event target."},
    {
      "id": "member_count",
      "label": "Member Count",
      "type": "number",
      "eventPath": "member_count",
      description: "Number of server members, when available."}
  ]
};
