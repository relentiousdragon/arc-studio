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
      "defaultValue": "",
      description: "First text value to compare."
    },
    {
      "id": "text_b",
      "label": "Text B",
      "type": "string",
      "defaultValue": "",
      description: "Second text value to compare."
    },
    {
      "id": "operator",
      "label": "Operator",
      "type": "string",
      "defaultValue": "equals",
      description: "Comparison to perform on the two text values."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "boolean",
      description: "True when the selected text comparison matches."
    }
  ]
};
