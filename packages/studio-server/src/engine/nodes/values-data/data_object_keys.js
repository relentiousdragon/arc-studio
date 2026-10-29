export default {
  "description": "Returns the enumerable property names of an object as an array.",
  "type": "data_object_keys",
  "category": "Values & Data",
  "label": "Object Keys",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "object",
      "label": "Object",
      "type": "object",
      "defaultValue": {}
    }
  ],
  "outputs": [
    {
      "id": "keys",
      "label": "Keys",
      "type": "object"
    },
    {
      "id": "length",
      "label": "Length",
      "type": "number"
    }
  ]
};
