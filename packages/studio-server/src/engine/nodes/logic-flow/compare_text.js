export default {
  "description": "Compares two text strings (equals, contains, startsWith)",
  "type": "compare_text",
  "category": "Logic & Flow",
  "label": "Compare Text",
  "color": "#8b5cf6",
  "inputs": [
    {
      "id": "text_a",
      "label": "Text A",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "text_b",
      "label": "Text B",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "operator",
      "label": "Operator",
      "type": "string",
      "defaultValue": "equals"
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "boolean"
    }
  ]
};
