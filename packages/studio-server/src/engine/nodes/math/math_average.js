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
      "defaultValue": 0,
      description: "First number included in the average."
    },
    {
      "id": "b",
      "label": "B",
      "type": "number",
      "defaultValue": 0,
      description: "Second number included in the average."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Arithmetic mean of the connected numbers."
    }
  ]
};
