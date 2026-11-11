export default {
  "description": "Acknowledge a slash command now and send its reply later. Connect Reply to Interaction after this node.",
  "type": "action_defer_reply",
  "category": "Discord Actions",
  "label": "Defer Reply",
  "color": "#10b981",
  "dynamicPins": {
    "kind": "connected-interaction-outputs"
  },
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts Defer Reply."},
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
      "id": "ephemeral",
      "label": "Ephemeral (Hidden)",
      "type": "boolean",
      "defaultValue": false,
      description: "Whether to hide the interaction response from other users."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after Defer Reply completes."},
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
