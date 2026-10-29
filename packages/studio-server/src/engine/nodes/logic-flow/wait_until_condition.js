export default {
  "description": "Checks a boolean condition until it becomes true. Times out through the Timed Out branch, polling is bounded.",
  "type": "wait_until_condition",
  "category": "Logic & Flow",
  "label": "Wait Until Condition",
  "color": "#8b5cf6",
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
      "defaultValue": false
    },
    {
      "id": "timeout_ms",
      "label": "Timeout (ms)",
      "type": "number",
      "defaultValue": 30000
    },
    {
      "id": "interval_ms",
      "label": "Check Every (ms)",
      "type": "number",
      "defaultValue": 250
    }
  ],
  "outputs": [
    {
      "id": "ready_exec",
      "label": "Ready",
      "type": "exec"
    },
    {
      "id": "timeout_exec",
      "label": "Timed Out",
      "type": "exec"
    }
  ]
};
