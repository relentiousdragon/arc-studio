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
      "defaultValue": []
    },
    {
      "id": "index",
      "label": "Index",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "value",
      "label": "New Item",
      "type": "arg",
      "defaultValue": null
    }
  ],
  "outputs": [
    {
      "id": "array",
      "label": "Array",
      "type": "object"
    },
    {
      "id": "updated",
      "label": "Updated",
      "type": "boolean"
    }
  ]
};
