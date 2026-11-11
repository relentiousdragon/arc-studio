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
      "type": "exec",
      description: "Starts the asynchronous wait."
    },
    {
      "id": "ms",
      "label": "Duration (ms)",
      "type": "number",
      "defaultValue": 1000,
      description: "Time to wait before continuing, in milliseconds."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after the wait completes."
    }
  ]
};
