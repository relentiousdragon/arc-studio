export default {
  "description": "Restricts a value between a minimum and maximum",
  "type": "math_clamp",
  "category": "Math",
  "label": "Clamp",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Number to restrict to the selected range."
    },
    {
      "id": "min",
      "label": "Minimum",
      "type": "number",
      "defaultValue": 0,
      description: "Lowest allowed result."
    },
    {
      "id": "max",
      "label": "Maximum",
      "type": "number",
      "defaultValue": 1,
      description: "Highest allowed result."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Input limited to the minimum and maximum."
    }
  ]
};
