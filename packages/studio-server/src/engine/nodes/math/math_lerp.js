export default {
  "description": "Linearly interpolates between A and B using a factor from 0 to 1",
  "type": "math_lerp",
  "category": "Math",
  "label": "Interpolate",
  "color": "#38bdf8",
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
      "defaultValue": 1
    },
    {
      "id": "t",
      "label": "Factor",
      "type": "number",
      "defaultValue": 0.5
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
