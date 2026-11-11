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
      "defaultValue": [],
      description: "Array whose length and empty state to check."
    }
  ],
  "outputs": [
    {
      "id": "length",
      "label": "Length",
      "type": "number",
      description: "Number of items in the array."
    },
    {
      "id": "empty",
      "label": "Is Empty",
      "type": "boolean",
      description: "True when the array has no items."
    }
  ]
};
