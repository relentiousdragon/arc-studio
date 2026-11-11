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
      "defaultValue": "",
      description: "ISO date or Unix timestamp in milliseconds to convert."
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "ISO date",
      "type": "string",
      description: "Date and time converted to UTC ISO 8601 text."
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean",
      description: "True when the input is a valid date or timestamp."
    }
  ]
};
