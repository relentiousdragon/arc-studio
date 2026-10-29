export default {
  "description": "Awaits a short timer for this run. Other Discord events and graph runs continue while it waits.",
  "type": "delay",
  "category": "Logic & Flow",
  "label": "Wait (Async)",
  "color": "#8b5cf6",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "ms",
      "label": "Duration (ms)",
      "type": "number",
      "defaultValue": 1000
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    }
  ]
};
