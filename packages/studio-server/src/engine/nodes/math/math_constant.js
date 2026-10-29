export default {
  "description": "Provides a standard mathematical constant",
  "type": "math_constant",
  "category": "Math",
  "label": "Math Constant",
  "color": "#38bdf8",
  "editorControls": [
    {
      "type": "select",
      "key": "constant",
      "label": "Mathematical constant",
      "defaultValue": "pi",
      "options": [
        { "value": "pi", "label": "π · Pi" },
        { "value": "tau", "label": "τ · Tau" },
        { "value": "e", "label": "e · Euler" },
        { "value": "golden_ratio", "label": "φ · Golden ratio" },
        { "value": "sqrt_two", "label": "√2" }
      ]
    }
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number"
    }
  ]
};
