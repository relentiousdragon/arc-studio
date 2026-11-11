export default {
  "description": "Divides A by B, division by zero returns 0",
  "type": "math_divide",
  "category": "Math",
  "label": "Divide (÷)",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "a",
      "label": "A",
      "type": "number",
      "defaultValue": 0,
      description: "Number to divide."
    },
    {
      "id": "b",
      "label": "B",
      "type": "number",
      "defaultValue": 0,
      description: "Number to divide by."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "A divided by B, or zero when B is zero."
    }
  ]
};
