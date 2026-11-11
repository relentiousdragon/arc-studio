export default {
  "description": "Finds the first item equal to Value. Set Path to compare a nested property, such as id or user.name.",
  "createdAt": "2026-10-20T16:53:56.000Z",
  "type": "data_find_array_item",
  "category": "Values & Data",
  "label": "Find Array Item",
  "color": "#06b6d4",
  "defaultData": {
    "path": "",
    "value": ""
  },
  "inputs": [
    {
      "id": "array",
      "label": "Array",
      "type": "object",
      "defaultValue": [],
      description: "Array to search."
    },
    {
      "id": "path",
      "label": "Property path",
      "type": "string",
      "defaultValue": "",
      description: "Optional property path to compare on each item."
    },
    {
      "id": "value",
      "label": "Match value",
      "type": "arg",
      "defaultValue": "",
      description: "Value to find in the array or selected property."
    }
  ],
  "outputs": [
    {
      "id": "item",
      "label": "Item",
      "type": "arg",
      description: "First matching item, when found."
    },
    {
      "id": "index",
      "label": "Index",
      "type": "number",
      description: "Zero-based position of the first matching item."
    },
    {
      "id": "found",
      "label": "Found",
      "type": "boolean",
      description: "True when a matching item exists."
    }
  ]
};
