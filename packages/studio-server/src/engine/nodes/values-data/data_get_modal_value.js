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
      "defaultValue": [],
      description: "Submitted values from the modal interaction."
    },
    {
      "id": "custom_id",
      "label": "Field Custom ID",
      "type": "string",
      "defaultValue": "",
      description: "Custom ID of the submitted modal field."
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "object",
      description: "Value submitted for the matching field."
    },
    {
      "id": "found",
      "label": "Found",
      "type": "boolean",
      description: "True when a field with this custom ID was submitted."
    }
  ]
};
