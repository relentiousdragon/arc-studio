export default {
  "description": "Parses a complete decimal number, including sign and exponent. Invalid or non-finite input returns 0, check Valid before using it.",
  "type": "data_to_number",
  "category": "Values & Data",
  "label": "Text to Number",
  "color": "#06b6d4",
  "editorControls": [
    {
      "type": "text",
      "key": "text",
      "inputId": "text",
      "label": "Text",
      "defaultValue": "",
      "placeholder": "e.g. 42.5",
      "hideWhenConnected": true
    }
  ],
  "inputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "number",
      "label": "Number",
      "type": "number"
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean"
    }
  ]
};
