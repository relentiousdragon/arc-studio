export default {
  "description": "Safely reads a nested object or array path such as user.profile.name or items[0].id. Check Exists when the path may be missing.",
  "createdAt": "2026-10-20T16:53:56.000Z",
  "type": "data_get_value_by_path",
  "category": "Values & Data",
  "label": "Get Value by Path",
  "color": "#06b6d4",
  "defaultData": {
    "path": "",
    "fallback": ""
  },
  "inputs": [
    {
      "id": "value",
      "label": "Object / Array",
      "type": "object",
      "defaultValue": {},
      description: "Object or array to read from."
    },
    {
      "id": "path",
      "label": "Path",
      "type": "string",
      "defaultValue": "",
      description: "Property path to read, such as user.name or items[0].id."
    },
    {
      "id": "fallback",
      "label": "Fallback",
      "type": "arg",
      "defaultValue": "",
      description: "Value to return when the path does not exist."
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Value or fallback",
      "type": "arg",
      description: "Value at the path, or the fallback when the path is missing."
    },
    {
      "id": "exists",
      "label": "Exists",
      "type": "boolean",
      description: "True when the path exists."
    }
  ]
};
