export default {
  "description": "Converts text to uppercase.",
  "type": "data_text_uppercase",
  "category": "Values & Data",
  "label": "Uppercase Text",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      "defaultValue": "",
      description: "Text to convert to uppercase."
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      description: "Input text converted to uppercase."
    }
  ]
};
