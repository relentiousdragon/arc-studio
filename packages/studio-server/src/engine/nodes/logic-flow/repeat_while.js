export default {
  "description": "While Condition is true, waits at least 100 ms, runs Body once, and checks again. It can run indefinitely. Route changes through shared graph variables or other live inputs to stop it.",
  "introducedAt": "2026-10-17T00:00:00.000Z",
  "type": "repeat_while",
  "category": "Logic & Flow",
  "label": "Repeat While",
  "color": "#8b5cf6",
  "defaultData": {
    "condition": true,
    "interval_ms": 500
  },
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts checking the loop condition."
    },
    {
      "id": "condition",
      "label": "Condition",
      "type": "boolean",
      "defaultValue": true,
      description: "Repeats the Body branch while this value is true."
    },
    {
      "id": "interval_ms",
      "label": "Interval (ms)",
      "type": "number",
      "defaultValue": 500,
      description: "Time to wait before each check and iteration, in milliseconds."
    }
  ],
  "outputs": [
    {
      "id": "body_exec",
      "label": "Body",
      "type": "exec",
      description: "Runs once for each loop iteration."
    },
    {
      "id": "completed_exec",
      "label": "Completed",
      "type": "exec",
      description: "Runs when the condition becomes false."
    },
    {
      "id": "iteration",
      "label": "Iteration",
      "type": "number",
      description: "One-based number of the current iteration."
    }
  ]
};
