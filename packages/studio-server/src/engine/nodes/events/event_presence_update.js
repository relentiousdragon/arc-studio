export default {
  "description": "A member presence or status changes",
  "type": "event_presence_update",
  "category": "Events",
  "label": "On Presence Updated",
  "color": "#5865F2",
  "gatewayEvent": "PRESENCE_UPDATE",
  "gatewayIntents": [
    "GUILD_PRESENCES"
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
    },
    {
      "id": "status",
      "label": "Status",
      "type": "string",
      "eventPath": "status"
    }
  ]
};
