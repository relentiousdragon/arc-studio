export default {
  "description": "Returns -1, 0, or 1 for the input sign",
  "type": "math_sign",
  "category": "Math",
  "label": "Sign",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Number whose sign to check."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "-1 for negative, 0 for zero, or 1 for positive input."
    }
  ]
};
