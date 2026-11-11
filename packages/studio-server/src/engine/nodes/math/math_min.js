export default {
  "description": "Returns the smaller number",
  "type": "math_min",
  "category": "Math",
  "label": "Minimum (min)",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "a",
      "label": "A",
      "type": "number",
      "defaultValue": 0,
      description: "First number to compare."
    },
    {
      "id": "b",
      "label": "B",
      "type": "number",
      "defaultValue": 0,
      description: "Second number to compare."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Smaller of A and B."
    }
  ]
};
