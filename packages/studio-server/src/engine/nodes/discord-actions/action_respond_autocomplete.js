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
      "type": "exec"
    },
    {
      "id": "interaction_id",
      "label": "Interaction ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "interaction_token",
      "label": "Interaction Token",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "choices",
      "label": "Suggestions",
      "type": "object",
      "defaultValue": []
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "choice_count",
      "label": "Suggestions Sent",
      "type": "number"
    },
    {
      "id": "success",
      "label": "Success",
      "type": "boolean"
    }
  ]
};
