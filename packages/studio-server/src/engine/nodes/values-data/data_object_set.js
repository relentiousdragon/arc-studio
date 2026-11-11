export default {
  "description": "Returns a copy of an object with the selected property added or replaced.",
  "type": "data_object_set",
  "category": "Values & Data",
  "label": "Set Object Property",
  "color": "#06b6d4",
  "defaultData": {
    "key": "",
    "value": ""
  },
  "editorControls": [
    { "key": "key", "label": "Property", "type": "text", "placeholder": "property_name" },
    { "key": "value", "label": "Value", "type": "text", "placeholder": "Value to assign" }
  ],
  "inputs": [
    {
      "id": "object",
      "label": "Object",
      "type": "object",
      "defaultValue": {},
      description: "Object to copy and update."
    },
    {
      "id": "key",
      "label": "Property",
      "type": "string",
      "defaultValue": "",
      description: "Property name to add or replace."
    },
    {
      "id": "value",
      "label": "Value",
      "type": "arg",
      "defaultValue": "",
      description: "Value to assign to the property."
    }
  ],
  "outputs": [
    {
      "id": "object",
      "label": "Object",
      "type": "object",
      description: "Copy of the object with the selected property set."
    }
  ]
};
