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
      "type": "exec"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "id"
    },
    {
      "id": "unavailable",
      "label": "Unavailable",
      "type": "boolean",
      "eventPath": "unavailable"
    }
  ]
};
