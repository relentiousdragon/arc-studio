export default {
  "description": "Converts booleans, numbers, and common text values (true/false, yes/no, 1/0, on/off). Unknown text returns false; check Valid.",
  "type": "data_to_boolean",
  "category": "Values & Data",
  "label": "To Boolean",
  "color": "#06b6d4",
  "editorControls": [
    {
      "type": "select",
      "key": "value",
      "inputId": "value",
      "label": "Value",
      "defaultValue": false,
      "valueType": "boolean",
      "options": [
        { "value": false, "label": "False" },
        { "value": true, "label": "True" }
      ],
      "hideWhenConnected": true
    }
  ],
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "arg",
      "defaultValue": false
    }
  ],
  "outputs": [
    {
      "id": "boolean",
      "label": "Boolean",
      "type": "boolean"
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean"
    }
  ]
};
