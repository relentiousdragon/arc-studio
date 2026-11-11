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
      "type": "exec",
      description: "Runs while a user types an autocomplete-enabled command option."},
    {
      "id": "command_name",
      "label": "Command Name",
      "type": "string",
      description: "Name of the invoked application command."},
    {
      "id": "focused_option",
      "label": "Focused Option",
      "type": "string",
      description: "Name of the command option being completed."},
    {
      "id": "query",
      "label": "Typed Text",
      "type": "string",
      description: "Text entered for the focused option."},
    {
      "id": "options",
      "label": "Other Arguments",
      "type": "object",
      description: "Arguments submitted with the command."},
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      description: "ID of the user who triggered or was affected by the event."},
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "channel_id",
      description: "ID of the channel where the event occurred."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."},
    {
      "id": "interaction_id",
      "label": "Interaction ID",
      "type": "string",
      description: "ID of the interaction."},
    {
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string",
      description: "Token used to respond to the interaction."}
  ]
};
