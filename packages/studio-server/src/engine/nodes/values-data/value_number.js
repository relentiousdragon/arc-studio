export default {
  "description": "Provides a numeric constant",
  "type": "value_number",
  "category": "Values & Data",
  "label": "Number",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Number provided by this node."
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Number",
      "type": "number",
      description: "Configured number value."
    }
  ]
};
