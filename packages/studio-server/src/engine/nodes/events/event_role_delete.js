export default {
  "description": "A role is deleted. Discord sends only the server and role IDs.",
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
      "type": "exec",
      description: "Runs when a role is deleted."},
    {
      "id": "role_id",
      "label": "Role ID",
      "type": "string",
      "eventPath": "role_id",
      description: "ID of the role tied to this event."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."}
  ]
};
