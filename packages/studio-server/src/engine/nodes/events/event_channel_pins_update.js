export default {
  "description": "Channel pins are updated",
  "type": "event_channel_pins_update",
  "category": "Events",
  "label": "On Pins Updated",
  "color": "#5865F2",
  "gatewayEvent": "CHANNEL_PINS_UPDATE",
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
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "channel_id"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id"
    },
    {
      "id": "last_pin_timestamp",
      "label": "Last Pin At",
      "type": "string",
      "eventPath": "last_pin_timestamp"
    }
  ]
};
