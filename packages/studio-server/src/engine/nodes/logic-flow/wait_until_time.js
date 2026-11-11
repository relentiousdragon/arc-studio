export default {
  "description": "Waits until an ISO date/time or Unix timestamp in milliseconds. Maximum wait is 7 days.",
  "type": "wait_until_time",
  "category": "Logic & Flow",
  "label": "Wait Until Time",
  "color": "#8b5cf6",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts waiting for the target time."
    },
    {
      "id": "time",
      "label": "Time (ISO or ms)",
      "type": "string",
      "defaultValue": "",
      description: "ISO date or Unix timestamp in milliseconds to wait for."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues when the target time is reached."
    }
  ]
};
