export default {
  "description": "Provides a true or false constant",
  "type": "value_boolean",
  "category": "Values & Data",
  "label": "Boolean",
  "color": "#ef4444",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "boolean",
      "defaultValue": true,
      description: "Boolean value provided by this node."
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Boolean",
      "type": "boolean",
      description: "Configured boolean value."
    }
  ]
};
