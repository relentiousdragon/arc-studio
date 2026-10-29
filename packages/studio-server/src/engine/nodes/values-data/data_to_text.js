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
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string"
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean"
    }
  ]
};
