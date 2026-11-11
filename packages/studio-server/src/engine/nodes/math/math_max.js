export default {
  "description": "Returns the larger number",
  "type": "math_max",
  "category": "Math",
  "label": "Maximum (max)",
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
      description: "Larger of A and B."
    }
  ]
};
