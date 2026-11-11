export default {
  "description": "Reads a property or nested path by key (such as id or author.username). Check Exists to distinguish a missing property from an empty value.",
  "type": "data_object_get",
  "category": "Values & Data",
  "label": "Get Object Property",
  "color": "#06b6d4",
  "defaultData": {
    "key": ""
  },
  "editorControls": [
    { "key": "key", "label": "Property", "type": "text", "placeholder": "property_name" }
  ],
  "inputs": [
    {
      "id": "object",
      "label": "Object",
      "type": "object",
      "defaultValue": {},
      description: "Object to read a property from."
    },
    {
      "id": "key",
      "label": "Property",
      "type": "string",
      "defaultValue": "",
      description: "Property name or nested path to read."
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "arg",
      description: "Value of the selected property, when it exists."
    },
    {
      "id": "exists",
      "label": "Exists",
      "type": "boolean",
      description: "True when the property exists."
    }
  ]
};
