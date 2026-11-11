export default {
  "description": "Keeps items whose value (or selected property path) matches the chosen comparison.",
  "createdAt": "2026-10-20T16:53:56.000Z",
  "type": "data_filter_array",
  "category": "Values & Data",
  "label": "Filter Array",
  "color": "#06b6d4",
  "defaultData": {
    "path": "",
    "operator": "equals",
    "value": ""
  },
  "inputs": [
    {
      "id": "array",
      "label": "Array",
      "type": "object",
      "defaultValue": [],
      description: "Array whose items to test."
    },
    {
      "id": "path",
      "label": "Property path",
      "type": "string",
      "defaultValue": "",
      description: "Optional property path to read from each item."
    },
    {
      "id": "operator",
      "label": "Comparison",
      "type": "string",
      "defaultValue": "equals",
      description: "Comparison to apply to each item or property."
    },
    {
      "id": "value",
      "label": "Match value",
      "type": "arg",
      "defaultValue": "",
      description: "Value used for the selected comparison."
    }
  ],
  "outputs": [
    {
      "id": "array",
      "label": "Filtered items",
      "type": "object",
      description: "Items that match the selected comparison."
    },
    {
      "id": "count",
      "label": "Count",
      "type": "number",
      description: "Number of items that matched."
    }
  ]
};
