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
      "type": "exec",
      description: "Starts the counted loop."
    },
    {
      "id": "count",
      "label": "Count",
      "type": "number",
      "defaultValue": 1,
      description: "Number of times to run the Body branch."
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
      description: "Runs after all iterations finish."
    },
    {
      "id": "index",
      "label": "Index (0-based)",
      "type": "number",
      description: "Zero-based index of the current iteration."
    }
  ]
};
