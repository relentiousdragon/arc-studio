export default {
  "description": "A thread is deleted",
  "type": "event_thread_delete",
  "category": "Events",
  "label": "On Thread Deleted",
  "color": "#5865F2",
  "gatewayEvent": "THREAD_DELETE",
  "gatewayIntents": [
    "GUILD_MESSAGES"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when a thread is deleted."},
    {
      "id": "thread_id",
      "label": "Thread ID",
      "type": "string",
      "eventPath": "id",
      description: "ID of the thread where the event occurred."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."},
    {
      "id": "parent_id",
      "label": "Parent Channel ID",
      "type": "string",
      "eventPath": "parent_id",
      description: "ID of the parent channel or category."},
    {
      "id": "channel_type",
      "label": "Channel Type",
      "type": "number",
      "eventPath": "type",
      description: "Discord channel type value."}
  ]
};
