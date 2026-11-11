export default {
  "description": "Provides a static or dynamic text string",
  "hidden": true,
  "type": "value_text",
  "category": "Values & Data",
  "label": "Text String",
  "color": "#f59e0b",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "string",
      "defaultValue": "Hello World",
      description: "Text provided by this node."
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Text",
      "type": "string",
      description: "Configured text value."
    }
  ]
};
