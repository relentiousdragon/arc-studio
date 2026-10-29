export default {
  "description": "Runs the Body branch once per iteration, then continues from Completed. Iterations are capped at 1,000 per run.",
  "type": "loop_count",
  "category": "Logic & Flow",
  "label": "For Count",
  "color": "#8b5cf6",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "count",
      "label": "Count",
      "type": "number",
      "defaultValue": 1
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
      "id": "index",
      "label": "Index (0-based)",
      "type": "number"
    }
  ]
};
