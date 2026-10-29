export default {
  "description": "Reads an item by its zero-based index. Check Found before using the result.",
  "type": "data_array_get",
  "category": "Values & Data",
  "label": "Get Array Item",
  "color": "#06b6d4",
  "defaultData": {
    "index": 0
  },
  "inputs": [
    {
      "id": "array",
      "label": "Array",
      "type": "object",
      "defaultValue": []
    },
    {
      "id": "index",
      "label": "Index",
      "type": "number",
      "defaultValue": 0
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Item",
      "type": "arg"
    },
    {
      "id": "found",
      "label": "Found",
      "type": "boolean"
    }
  ]
};
