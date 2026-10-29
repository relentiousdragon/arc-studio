export default {
  "description": "A server is updated",
  "type": "event_guild_update",
  "category": "Events",
  "label": "On Server Updated",
  "color": "#5865F2",
  "gatewayEvent": "GUILD_UPDATE",
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
      "id": "name",
      "label": "Name",
      "type": "string",
      "eventPath": "name"
    },
    {
      "id": "owner_id",
      "label": "Owner ID",
      "type": "string",
      "eventPath": "owner_id"
    }
  ]
};
