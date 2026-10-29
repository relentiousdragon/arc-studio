export default {
  "description": "A role is deleted",
  "type": "event_role_delete",
  "category": "Events",
  "label": "On Role Deleted",
  "color": "#5865F2",
  "gatewayEvent": "GUILD_ROLE_DELETE",
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
      "id": "role_id",
      "label": "Role ID",
      "type": "string",
      "eventPath": "role_id"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id"
    }
  ]
};
