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
      "defaultValue": "",
      description: "JSON text to parse."
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "object",
      description: "Parsed value when the JSON text is valid."
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean",
      description: "True when the input contains valid JSON."
    }
  ]
};
