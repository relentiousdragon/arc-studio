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
      "defaultValue": []
    },
    {
      "id": "path",
      "label": "Property path",
      "type": "string",
      "defaultValue": ""
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
      "id": "item",
      "label": "Item",
      "type": "arg"
    },
    {
      "id": "index",
      "label": "Index",
      "type": "number"
    },
    {
      "id": "found",
      "label": "Found",
      "type": "boolean"
    }
  ]
};
