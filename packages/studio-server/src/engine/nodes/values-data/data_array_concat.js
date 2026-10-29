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
      "defaultValue": []
    },
    {
      "id": "array_2",
      "label": "Array 2",
      "type": "object",
      "defaultValue": []
    }
  ],
  "outputs": [
    {
      "id": "array",
      "label": "Array",
      "type": "object"
    },
    {
      "id": "length",
      "label": "Length",
      "type": "number"
    }
  ]
};
