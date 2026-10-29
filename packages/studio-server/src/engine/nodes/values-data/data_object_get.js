export default {
  "description": "Reads a property by key. Check Exists to distinguish a missing property from an empty value.",
  "type": "data_object_get",
  "category": "Values & Data",
  "label": "Get Object Property",
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
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "arg"
    },
    {
      "id": "exists",
      "label": "Exists",
      "type": "boolean"
    }
  ]
};
