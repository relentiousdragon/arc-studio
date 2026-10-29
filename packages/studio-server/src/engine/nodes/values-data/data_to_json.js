export default {
  "description": "Serializes a value to compact JSON. Cyclic or unsupported values return an empty string and valid=false.",
  "type": "data_to_json",
  "category": "Values & Data",
  "label": "To JSON",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "object",
      "defaultValue": null
    }
  ],
  "outputs": [
    {
      "id": "json",
      "label": "JSON",
      "type": "string"
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean"
    }
  ]
};
