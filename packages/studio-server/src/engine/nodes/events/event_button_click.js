export default {
  "description": "Fires when a message component button is pressed",
  "type": "event_button_click",
  "category": "Events",
  "label": "On Button Click",
  "color": "#5865F2",
  "gatewayEvent": "INTERACTION_CREATE",
  "gatewayInteractionType": 3,
  "gatewayComponentTypes": [
    2
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "message",
      "label": "Source Message Object",
      "type": "object",
      "eventPath": "message"
    },
    {
      "id": "custom_id",
      "label": "Custom ID",
      "type": "string"
    },
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id"
    },
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "channel_id"
    },
    {
      "id": "application_id",
      "label": "Application ID",
      "type": "string"
    },
    {
      "id": "interaction_id",
      "label": "Interaction ID",
      "type": "string"
    },
    {
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string"
    }
  ]
};
