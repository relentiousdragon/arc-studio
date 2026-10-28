export default {
  "description": "Collects connected values in order. One extra socket appears as you use each socket, up to 50 items, use Combine Arrays to combine arrays.",
  "type": "data_array_create",
  "category": "Values & Data",
  "label": "Create Array",
  "color": "#06b6d4",
  "dynamicPins": { "kind": "array-items", "id": "item_{index}", "label": "Item {index}", "connectionPrefix": "item_", "type": "arg", "defaultValue": null, "min": 1, "max": 50, "revealNext": true },
  "inputs": [
    {
      "id": "item_1",
      "label": "Item 1",
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
      "id": "length",
      "label": "Length",
      "type": "number"
    }
  ]
};
