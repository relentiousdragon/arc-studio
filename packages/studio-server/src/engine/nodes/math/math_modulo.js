export default {
  "description": "Returns the remainder after division",
  "type": "math_modulo",
  "category": "Math",
  "label": "Remainder (mod)",
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
      description: "Remainder after dividing A by B."
    }
  ]
};
