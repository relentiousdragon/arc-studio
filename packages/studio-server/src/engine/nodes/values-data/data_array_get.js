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
      "defaultValue": [],
      description: "Array to read an item from."
    },
    {
      "id": "index",
      "label": "Index",
      "type": "number",
      "defaultValue": 0,
      description: "Zero-based position of the item to read."
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Item",
      "type": "arg",
      description: "Item at the selected index, when found."
    },
    {
      "id": "found",
      "label": "Found",
      "type": "boolean",
      description: "True when the selected index exists in the array."
    }
  ]
};
