export default {
  "description": "Adds two numbers",
  "type": "math_add",
  "category": "Math",
  "label": "Add (+)",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "a",
      "label": "A",
      "type": "number",
      "defaultValue": 0,
      description: "First number to add."
    },
    {
      "id": "b",
      "label": "B",
      "type": "number",
      "defaultValue": 0,
      description: "Second number to add."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Sum of A and B."
    }
  ]
};
