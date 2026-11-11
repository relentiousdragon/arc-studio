export default {
  "description": "Returns the current Unix timestamp in milliseconds and the matching UTC ISO 8601 date.",
  "type": "data_current_timestamp",
  "category": "Values & Data",
  "label": "Current Timestamp",
  "color": "#06b6d4",
  "inputs": [],
  "outputs": [
    {
      "id": "timestamp_ms",
      "label": "Unix timestamp (ms)",
      "type": "number",
      description: "Current Unix timestamp in milliseconds."
    },
    {
      "id": "iso",
      "label": "ISO date",
      "type": "string",
      description: "Current date and time in UTC ISO 8601 format."
    }
  ]
};