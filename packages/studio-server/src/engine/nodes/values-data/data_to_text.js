export default {
  "description": "Converts a value to text. Objects and arrays become JSON, null becomes empty text. Check Valid if the value cannot be serialized.",
  "type": "data_to_text",
  "category": "Values & Data",
  "label": "To Text",
  "color": "#06b6d4",
  "editorControls": [
    {
      "type": "text",
      "key": "value",
      "inputId": "value",
      "label": "Value",
      "defaultValue": "",
      "placeholder": "Used when unconnected",
      "hideWhenConnected": true
    }
  ],
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "arg",
      "defaultValue": "",
      description: "Value to convert to text."
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      description: "Text representation of the input value."
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean",
      description: "True when the input can be converted to text."
    }
  ]
};
