export default {
  "description": "Returns a copy of an object with the selected property added or replaced.",
  "type": "data_object_set",
  "category": "Values & Data",
  "label": "Set Object Property",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "object",
      "label": "Object",
      "type": "object",
      "defaultValue": {}
    },
    {
      "id": "key",
      "label": "Property",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "value",
      "label": "Value",
      "type": "arg",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "object",
      "label": "Object",
      "type": "object"
    }
  ]
};
