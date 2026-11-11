export default {
  "description": "Evaluates given expression",
  "type": "math_eval",
  "category": "Math",
  "label": "Evaluate",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "expression",
      "label": "Expression",
      "type": "string",
      "defaultValue": "",
      description: "Arithmetic expression to evaluate."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Numeric result of the expression."
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean",
      description: "True when the expression is valid."
    }
  ]
};
