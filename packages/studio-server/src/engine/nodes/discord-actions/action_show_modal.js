export default {
  "description": "Opens a configured Discord modal as the initial response to an interaction.",
  "type": "action_show_modal",
  "category": "Discord Actions",
  "label": "Show Popup Modal",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts Show Popup Modal."},
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
      "id": "modal",
      "label": "Modal",
      "type": "object",
      description: "Modal definition to show to the user."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after Show Popup Modal completes."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
