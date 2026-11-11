export default {
  "description": "Updates legacy message buttons and select menus. Use Modify Components V2 for Components V2 layouts.",
  "type": "modify_components",
  "category": "Values & Data",
  "label": "Modify Components",
  "color": "#f59e0b",
  "inputs": [
    {
      "id": "components",
      "label": "Components",
      "type": "object",
      description: "Legacy buttons and select menus to update."
    },
    {
      "id": "custom_id",
      "label": "Target Custom ID (\"all\" for all)",
      "type": "string",
      "defaultValue": "all",
      description: "Custom ID of the target component, or all to update every component."
    },
    {
      "id": "disabled",
      "label": "Disabled",
      "type": "boolean",
      "defaultValue": true,
      description: "Whether to disable the target component."
    },
    {
      "id": "label",
      "label": "New Label (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional replacement label for a button."
    },
    {
      "id": "style",
      "label": "New Style (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional replacement button style."
    },
    {
      "id": "placeholder",
      "label": "New Placeholder (Select Menus)",
      "type": "string",
      "defaultValue": "",
      description: "Optional replacement placeholder for a select menu."
    }
  ],
  "outputs": [
    {
      "id": "components",
      "label": "Components",
      "type": "object",
      description: "Updated legacy message components."
    }
  ]
};
