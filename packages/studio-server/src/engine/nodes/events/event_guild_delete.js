export default {
  "description": "A server becomes unavailable",
  "type": "event_guild_delete",
  "category": "Events",
  "label": "On Server Unavailable",
  "color": "#5865F2",
  "gatewayEvent": "GUILD_DELETE",
  "gatewayIntents": [
    "GUILDS"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when a server becomes unavailable."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "id",
      description: "ID of the server where the event occurred."},
    {
      "id": "unavailable",
      "label": "Unavailable",
      "type": "boolean",
      "eventPath": "unavailable",
      description: "Whether the server is temporarily unavailable."}
  ]
};
