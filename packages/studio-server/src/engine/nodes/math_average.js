export default {
  "description": "Averages up to 50 values. Connect the last input to reveal another.",
  "type": "math_average",
  "category": "Math",
  "label": "Average",
  "color": "#38bdf8",
  "dynamicPins": { "kind": "math-list", "baseIds": ["a", "b", "c", "d"], "extraPrefix": "value_", "extraLabel": "Value", "type": "number", "defaultValue": 0, "min": 2, "max": 50 },
  "inputs": [
    {
      "id": "a",
      "label": "A",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "b",
      "label": "B",
      "type": "number",
      "defaultValue": 0
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number"
    }
  ]
};
