export default {
  "description": "Multiplies two numbers",
  "type": "math_multiply",
  "category": "Math",
  "label": "Multiply (×)",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "a",
      "label": "A",
      "type": "number",
      "defaultValue": 0,
      description: "First number to multiply."
    },
    {
      "id": "b",
      "label": "B",
      "type": "number",
      "defaultValue": 0,
      description: "Second number to multiply."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Product of A and B."
    }
  ]
};
