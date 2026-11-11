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
      "type": "exec",
      description: "Starts the function graph."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after the function returns."
    },
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Value returned by the called function."
    }
  ]
};
