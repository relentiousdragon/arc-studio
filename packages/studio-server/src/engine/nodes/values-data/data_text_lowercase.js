export default {
  "description": "Converts text to lowercase.",
  "type": "data_text_lowercase",
  "category": "Values & Data",
  "label": "Lowercase Text",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      "defaultValue": "",
      description: "Text to convert to lowercase."
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      description: "Input text converted to lowercase."
    }
  ]
};
