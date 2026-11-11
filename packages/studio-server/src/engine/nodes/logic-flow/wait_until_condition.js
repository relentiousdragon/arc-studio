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
      "type": "exec",
      description: "Starts checking the condition."
    },
    {
      "id": "condition",
      "label": "Condition",
      "type": "boolean",
      "defaultValue": false,
      description: "Waits until this value becomes true."
    },
    {
      "id": "timeout_ms",
      "label": "Timeout (ms)",
      "type": "number",
      "defaultValue": 30000,
      description: "Maximum time to wait before taking the Timed Out branch, in milliseconds."
    },
    {
      "id": "interval_ms",
      "label": "Check Every (ms)",
      "type": "number",
      "defaultValue": 250,
      description: "Time between condition checks, in milliseconds."
    }
  ],
  "outputs": [
    {
      "id": "ready_exec",
      "label": "Ready",
      "type": "exec",
      description: "Runs when the condition becomes true."
    },
    {
      "id": "timeout_exec",
      "label": "Timed Out",
      "type": "exec",
      description: "Runs when the condition does not become true before the timeout."
    }
  ]
};
