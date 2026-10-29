export default {
  "description": "A scheduled event is created",
  "type": "event_scheduled_event_create",
  "category": "Events",
  "label": "On Scheduled Event Created",
  "color": "#5865F2",
  "gatewayEvent": "GUILD_SCHEDULED_EVENT_CREATE",
  "gatewayIntents": [
    "GUILD_SCHEDULED_EVENTS"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "event_id",
      "label": "Event ID",
      "type": "string",
      "eventPath": "id"
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
      "eventPath": "name"
    },
    {
      "id": "status",
      "label": "Status",
      "type": "number",
      "eventPath": "status"
    }
  ]
};
