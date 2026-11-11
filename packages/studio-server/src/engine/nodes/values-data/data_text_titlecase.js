export default {
  "description": "Capitalizes the first letter of each word.",
  "type": "data_text_titlecase",
  "category": "Values & Data",
  "label": "Title Case Text",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      "defaultValue": "",
      description: "Text whose words to capitalize."
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      description: "Text with the first letter of each word capitalized."
    }
  ]
};
