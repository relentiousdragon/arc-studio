export default {
  "description": "Returns a copy with connected items appended in socket order. Connect an item to reveal another socket, up to 50, chain another Append Array Items node for more.",
  "type": "data_array_append",
  "category": "Values & Data",
  "label": "Append Array Items",
  "color": "#06b6d4",
  "dynamicPins": { "kind": "array-append-items", "id": "item_{index}", "label": "Item {index}", "connectionPrefix": "item_", "type": "arg", "min": 1, "max": 50, "revealNext": true },
  "inputs": [
    {
      "id": "array",
      "label": "Array",
      "type": "object",
      "defaultValue": []
    },
    {
      "id": "item_1",
      "label": "Item 1",
      "type": "arg",
      "defaultValue": undefined
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
