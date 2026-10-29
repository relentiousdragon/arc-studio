export default {
  "description": "Enables, disables, or updates buttons/select menus in an action row",
  "type": "modify_components",
  "category": "Values & Data",
  "label": "Modify Components",
  "color": "#f59e0b",
  "inputs": [
    {
      "id": "components",
      "label": "Components",
      "type": "object"
    },
    {
      "id": "custom_id",
      "label": "Target Custom ID (\"all\" for all)",
      "type": "string",
      "defaultValue": "all"
    },
    {
      "id": "disabled",
      "label": "Disabled",
      "type": "boolean",
      "defaultValue": true
    },
    {
      "id": "label",
      "label": "New Label (Optional)",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "style",
      "label": "New Style (Optional)",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "components",
      "label": "Components",
      "type": "object"
    }
  ]
};
