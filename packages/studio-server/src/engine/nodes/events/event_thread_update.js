export default {
  "description": "A thread is updated",
  "type": "event_thread_update",
  "category": "Events",
  "label": "On Thread Updated",
  "color": "#5865F2",
  "gatewayEvent": "THREAD_UPDATE",
  "gatewayIntents": [
    "GUILD_MESSAGES"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "thread_id",
      "label": "Thread ID",
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
      "id": "parent_id",
      "label": "Parent Channel ID",
      "type": "string",
      "eventPath": "parent_id"
    },
    {
      "id": "name",
      "label": "Name",
      "type": "string",
      "eventPath": "name"
    }
  ]
};
