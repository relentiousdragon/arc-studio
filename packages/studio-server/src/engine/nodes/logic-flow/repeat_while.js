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
      "type": "exec"
    },
    {
      "id": "condition",
      "label": "Condition",
      "type": "boolean",
      "defaultValue": true
    },
    {
      "id": "interval_ms",
      "label": "Interval (ms)",
      "type": "number",
      "defaultValue": 500
    }
  ],
  "outputs": [
    {
      "id": "body_exec",
      "label": "Body",
      "type": "exec"
    },
    {
      "id": "completed_exec",
      "label": "Completed",
      "type": "exec"
    },
    {
      "id": "iteration",
      "label": "Iteration",
      "type": "number"
    }
  ]
};
