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
      "type": "exec",
      description: "Runs when a member presence or status changes."},
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "eventPath": "user.id",
      description: "ID of the user who triggered or was affected by the event."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."},
    {
      "id": "status",
      "label": "Status",
      "type": "string",
      "eventPath": "status",
      description: "Current presence status of the user."}
  ]
};
