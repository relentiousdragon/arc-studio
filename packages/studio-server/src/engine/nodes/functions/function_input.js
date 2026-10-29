export default {
  "description": "Function graph entry point with multiple typed arguments and an execution output",
  "type": "function_input",
  "dynamicPins": { "kind": "function-input-arguments", "version": 1 },
  "category": "Functions",
  "label": "Function Input",
  "color": "#a78bfa",
  "defaultData": {
    "arguments": []
  },
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "value",
      "label": "Value",
      "type": "number"
    }
  ]
};
