export default {
  "description": "Removes whitespace from the start and end of text.",
  "type": "data_text_trim",
  "category": "Values & Data",
  "label": "Trim Text",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      "defaultValue": "",
      description: "Text to trim."
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      description: "Input text without whitespace at the start or end."
    }
  ]
};
