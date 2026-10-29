export default {
  "description": "A channel is updated",
  "type": "event_channel_update",
  "category": "Events",
  "label": "On Channel Updated",
  "color": "#5865F2",
  "gatewayEvent": "CHANNEL_UPDATE",
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
      "id": "channel_id",
      "label": "Channel ID",
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
      "id": "channel_type",
      "label": "Channel Type",
      "type": "number",
      "eventPath": "type"
    },
    {
      "id": "parent_id",
      "label": "Category ID",
      "type": "string",
      "eventPath": "parent_id"
    }
  ]
};
