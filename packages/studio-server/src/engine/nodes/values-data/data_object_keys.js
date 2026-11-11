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
      "defaultValue": {},
      description: "Object whose property names to list."
    }
  ],
  "outputs": [
    {
      "id": "keys",
      "label": "Keys",
      "type": "object",
      description: "Enumerable property names from the object."
    },
    {
      "id": "length",
      "label": "Length",
      "type": "number",
      description: "Number of property names in the result."
    }
  ]
};
