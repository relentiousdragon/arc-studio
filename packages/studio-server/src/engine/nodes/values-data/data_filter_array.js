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
      "defaultValue": []
    },
    {
      "id": "path",
      "label": "Property path",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "operator",
      "label": "Comparison",
      "type": "string",
      "defaultValue": "equals"
    },
    {
      "id": "value",
      "label": "Match value",
      "type": "arg",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "array",
      "label": "Filtered items",
      "type": "object"
    },
    {
      "id": "count",
      "label": "Count",
      "type": "number"
    }
  ]
};
