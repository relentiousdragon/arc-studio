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
      "defaultValue": null,
      description: "Value to serialize as JSON."
    }
  ],
  "outputs": [
    {
      "id": "json",
      "label": "JSON",
      "type": "string",
      description: "Compact JSON text for the input value."
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean",
      description: "True when the value can be serialized."
    }
  ]
};
