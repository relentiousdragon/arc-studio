export default {
  "description": "Concatenates connected arrays in input order into a new array. Use another Create Array node for more than 50 individual items.",
  "type": "data_array_concat",
  "category": "Values & Data",
  "label": "Combine Arrays",
  "color": "#06b6d4",
  "dynamicPins": { "kind": "array-combine" },
  "inputs": [
    {
      "id": "array_1",
      "label": "Array 1",
      "type": "object",
      "defaultValue": [],
      description: "First array to combine."
    },
    {
      "id": "array_2",
      "label": "Array 2",
      "type": "object",
      "defaultValue": [],
      description: "Second array to append after the first."
    }
  ],
  "outputs": [
    {
      "id": "array",
      "label": "Array",
      "type": "object",
      description: "New array containing the items from both inputs in order."
    },
    {
      "id": "length",
      "label": "Length",
      "type": "number",
      description: "Number of items in the combined array."
    }
  ]
};
