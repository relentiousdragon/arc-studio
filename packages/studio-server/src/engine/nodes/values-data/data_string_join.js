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
      "defaultValue": [],
      description: "Array values to join into text."
    },
    {
      "id": "separator",
      "label": "Separator",
      "type": "string",
      "defaultValue": ", ",
      description: "Text placed between each array value."
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      description: "Array values joined into one text string."
    }
  ]
};
