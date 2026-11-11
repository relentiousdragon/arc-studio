export default {
  "description": "Acknowledge a button or select interaction now and update its message later. Connect Reply to Interaction after this node.",
  "type": "action_defer_update",
  "category": "Discord Actions",
  "label": "Defer Update",
  "color": "#10b981",
  "dynamicPins": {
    "kind": "connected-interaction-outputs"
  },
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts Defer Update."},
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
      description: "Token used to respond to the interaction."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after Defer Update completes."},
    {
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string",
      description: "Token used to continue responding to the interaction."},
    {
      "id": "interaction_id",
      "label": "Interaction ID",
      "type": "string",
      description: "ID of the interaction that was handled."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
