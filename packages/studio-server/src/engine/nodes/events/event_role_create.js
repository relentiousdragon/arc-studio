export default {
  "description": "A role is created",
  "type": "event_role_create",
  "category": "Events",
  "label": "On Role Created",
  "color": "#5865F2",
  "gatewayEvent": "GUILD_ROLE_CREATE",
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
      "eventPath": "role.id"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id"
    },
    {
      "id": "name",
      "label": "Name",
      "type": "string",
      "eventPath": "role.name"
    },
    {
      "id": "color",
      "label": "Color",
      "type": "number",
      "eventPath": "role.color"
    }
  ]
};
