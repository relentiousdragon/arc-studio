export default {
  "description": "Runs a reusable function graph and returns its result",
  "type": "function_call",
  "category": "Functions",
  "label": "Call Function",
  "color": "#a78bfa",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "result",
      "label": "Result",
      "type": "number"
    }
  ]
};
