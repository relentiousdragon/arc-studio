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
      "defaultValue": {}
    },
    {
      "id": "path",
      "label": "Path",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "fallback",
      "label": "Fallback",
      "type": "arg",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Value or fallback",
      "type": "arg"
    },
    {
      "id": "exists",
      "label": "Exists",
      "type": "boolean"
    }
  ]
};
