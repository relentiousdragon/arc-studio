export default {
  "description": "Returns a copy of the array with an existing zero-based index replaced. The source array is unchanged.",
  "type": "data_array_set",
  "category": "Values & Data",
  "label": "Edit Array Item",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "array",
      "label": "Array",
      "type": "object",
      "defaultValue": [],
      description: "Array to copy and update."
    },
    {
      "id": "index",
      "label": "Index",
      "type": "number",
      "defaultValue": 0,
      description: "Zero-based position of the item to replace."
    },
    {
      "id": "value",
      "label": "New Item",
      "type": "arg",
      "defaultValue": null,
      description: "Value to place at the selected index."
    }
  ],
  "outputs": [
    {
      "id": "array",
      "label": "Array",
      "type": "object",
      description: "Copy of the array with the selected item replaced."
    },
    {
      "id": "updated",
      "label": "Updated",
      "type": "boolean",
      description: "True when an existing array item was replaced."
    }
  ]
};
