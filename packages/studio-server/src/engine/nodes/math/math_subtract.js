export default {
  "description": "Subtracts B from A",
  "type": "math_subtract",
  "category": "Math",
  "label": "Subtract (−)",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "a",
      "label": "A",
      "type": "number",
      "defaultValue": 0,
      description: "Number to subtract from."
    },
    {
      "id": "b",
      "label": "B",
      "type": "number",
      "defaultValue": 0,
      description: "Number to subtract."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "A minus B."
    }
  ]
};
