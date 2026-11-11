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
      "type": "exec",
      description: "Runs when a scheduled event is created."},
    {
      "id": "event_id",
      "label": "Event ID",
      "type": "string",
      "eventPath": "id",
      description: "ID of the scheduled event."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."},
    {
      "id": "name",
      "label": "Name",
      "type": "string",
      "eventPath": "name",
      description: "Current name of the event target."},
    {
      "id": "status",
      "label": "Status",
      "type": "number",
      "eventPath": "status",
      description: "Scheduled event status."},
    {
      "id": "description",
      "label": "Description",
      "type": "string",
      "eventPath": "description",
      description: "Scheduled event description."},
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "channel_id",
      description: "Voice or stage channel for the event."},
    {
      "id": "creator_id",
      "label": "Creator ID",
      "type": "string",
      "eventPath": "creator_id",
      description: "User who created the event."},
    {
      "id": "scheduled_start_time",
      "label": "Starts At",
      "type": "string",
      "eventPath": "scheduled_start_time",
      description: "Scheduled start time."},
    {
      "id": "scheduled_end_time",
      "label": "Ends At",
      "type": "string",
      "eventPath": "scheduled_end_time",
      description: "Scheduled end time, if set."},
    {
      "id": "entity_type",
      "label": "Event Type",
      "type": "number",
      "eventPath": "entity_type",
      description: "Scheduled event location type."},
    {
      "id": "entity_id",
      "label": "Location ID",
      "type": "string",
      "eventPath": "entity_id",
      description: "Voice or stage channel ID."},
    {
      "id": "user_count",
      "label": "Interested Users",
      "type": "number",
      "eventPath": "user_count",
      description: "Users interested in attending."}
  ]
};
