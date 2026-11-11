export default {
  "description": "Parses a complete decimal number, including sign and exponent. Invalid or non-finite input returns 0, check Valid before using it.",
  "type": "data_to_number",
  "category": "Values & Data",
  "label": "To Number",
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
      "defaultValue": "",
      description: "Text containing a decimal number to parse."
    }
  ],
  "outputs": [
    {
      "id": "number",
      "label": "Number",
      "type": "number",
      description: "Parsed finite number, or zero when parsing fails."
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean",
      description: "True when the input is a valid finite number."
    }
  ]
};
