export default {
  "description": "Converts an ISO date or Unix millisecond timestamp to a UTC ISO 8601 string.",
  "type": "data_to_iso_time",
  "category": "Values & Data",
  "label": "To ISO Date",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "value",
      "label": "Date / timestamp",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "ISO date",
      "type": "string"
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean"
    }
  ]
};
