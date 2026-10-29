export default {
  "description": "Returns the number of items in an array and whether it is empty.",
  "type": "data_array_length",
  "category": "Values & Data",
  "label": "Array Length",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "array",
      "label": "Array",
      "type": "object",
      "defaultValue": []
    }
  ],
  "outputs": [
    {
      "id": "length",
      "label": "Length",
      "type": "number"
    },
    {
      "id": "empty",
      "label": "Is Empty",
      "type": "boolean"
    }
  ]
};
