export default {
  "description": "Fires when an application slash command is invoked",
  "type": "event_slash_command",
  "dynamicPins": { "kind": "slash-options", "version": 2 },
  "category": "Events",
  "label": "On Slash Command",
  "color": "#5865F2",
  "gatewayEvent": "INTERACTION_CREATE",
  "gatewayInteractionType": 2,
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
      "id": "subcommand_group_name",
      "label": "Subcommand Group",
      "type": "string"
    },
    {
      "id": "subcommand_name",
      "label": "Subcommand",
      "type": "string"
    },
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string"
    },
    {
      "id": "username",
      "label": "Username",
      "type": "string"
    },
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string"
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
    },
    {
      "id": "options",
      "label": "Command Arguments",
      "type": "object"
    }
  ]
};
