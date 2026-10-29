export default {
  "description": "Reads a submitted modal field by custom ID, multi-select fields return arrays.",
  "type": "data_get_modal_value",
  "category": "Values & Data",
  "label": "Get Modal Value",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "submitted_values",
      "label": "Submitted Values",
      "type": "object",
      "defaultValue": []
    },
    {
      "id": "custom_id",
      "label": "Field Custom ID",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "object"
    },
    {
      "id": "found",
      "label": "Found",
      "type": "boolean"
    }
  ]
};
