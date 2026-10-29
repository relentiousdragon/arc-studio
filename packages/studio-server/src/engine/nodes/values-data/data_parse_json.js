export default {
  "description": "Parses JSON text into a value. Check Valid before using the parsed output.",
  "type": "data_parse_json",
  "category": "Values & Data",
  "label": "Parse JSON",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "json",
      "label": "JSON",
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
      "id": "valid",
      "label": "Valid",
      "type": "boolean"
    }
  ]
};
