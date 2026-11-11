export default {
  "description": "Returns up to 25 suggestions from a wired array of name and value objects.",
  "type": "action_respond_autocomplete",
  "category": "Discord Actions",
  "label": "Respond to Autocomplete",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts Respond to Autocomplete."},
    {
      "id": "interaction_id",
      "label": "Interaction ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the interaction to respond to."},
    {
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string",
      "defaultValue": "",
      description: "Token used to respond to the interaction."},
    {
      "id": "choices",
      "label": "Suggestions",
      "type": "object",
      "defaultValue": [],
      description: "Suggestions to return for the focused command option."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after Respond to Autocomplete completes."},
    {
      "id": "choice_count",
      "label": "Suggestions Sent",
      "type": "number",
      description: "Number of suggestions sent to Discord."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
