export default {
  "description": "A modal is submitted",
  "type": "event_modal_submit",
  "category": "Events",
  "label": "On Modal Submitted",
  "color": "#5865F2",
  "gatewayEvent": "INTERACTION_CREATE",
  "gatewayIntents": [],
  "gatewayInteractionType": 5,
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "custom_id",
      "label": "Custom ID",
      "type": "string",
      "eventPath": "data.custom_id"
    },
    {
      "id": "submitted_values",
      "label": "Submitted Values",
      "type": "object",
      "eventPath": "data.components"
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
