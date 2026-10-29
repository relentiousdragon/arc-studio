export default {
  "description": "Joins array values into one string using the separator.",
  "type": "data_string_join",
  "category": "Values & Data",
  "label": "Join Text",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "array",
      "label": "Items",
      "type": "object",
      "defaultValue": []
    },
    {
      "id": "separator",
      "label": "Separator",
      "type": "string",
      "defaultValue": ", "
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string"
    }
  ]
};
