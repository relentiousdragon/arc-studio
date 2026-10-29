export default {
  "description": "A select menu is submitted",
  "type": "event_select_menu",
  "category": "Events",
  "label": "On Select Menu Used",
  "color": "#5865F2",
  "gatewayEvent": "INTERACTION_CREATE",
  "gatewayIntents": [],
  "gatewayInteractionType": 3,
  "gatewayComponentTypes": [
    3,
    5,
    6,
    7,
    8
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
      "type": "string",
      "eventPath": "data.custom_id"
    },
    {
      "id": "selected_values",
      "label": "Selected Values",
      "type": "string",
      "eventPath": "data.values"
    },
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "eventPath": "member.user.id"
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
      "type": "string",
      "eventPath": "application_id"
    },
    {
      "id": "interaction_id",
      "label": "Interaction ID",
      "type": "string",
      "eventPath": "id"
    },
    {
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string",
      "eventPath": "token"
    }
  ]
};
