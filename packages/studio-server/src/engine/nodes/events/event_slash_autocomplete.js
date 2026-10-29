export default {
  "description": "Runs while a user types an autocomplete-enabled slash command option.",
  "type": "event_slash_autocomplete",
  "category": "Events",
  "label": "On Command Autocomplete",
  "color": "#5865F2",
  "gatewayEvent": "INTERACTION_CREATE",
  "gatewayInteractionType": 4,
  "gatewayCommandType": 1,
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "command_name",
      "label": "Command Name",
      "type": "string"
    },
    {
      "id": "focused_option",
      "label": "Focused Option",
      "type": "string"
    },
    {
      "id": "query",
      "label": "Typed Text",
      "type": "string"
    },
    {
      "id": "options",
      "label": "Other Arguments",
      "type": "object"
    },
    {
      "id": "user_id",
      "label": "User ID",
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
