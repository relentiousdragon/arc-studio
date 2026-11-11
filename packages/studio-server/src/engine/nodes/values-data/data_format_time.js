export default {
  "description": "Formats an ISO date or Unix millisecond timestamp using a locale, time zone, and date/time styles.",
  "type": "data_format_time",
  "category": "Values & Data",
  "label": "Format Date & Time",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "value",
      "label": "Date / Timestamp",
      "type": "arg",
      "defaultValue": "",
      description: "ISO date or Unix timestamp in milliseconds to format."
    },
    {
      "id": "timezone",
      "label": "Time zone",
      "type": "string",
      "defaultValue": "UTC",
      description: "Time zone used to format the date."
    },
    {
      "id": "style",
      "label": "Date Format",
      "type": "string",
      "defaultValue": "DD/MM/YYYY - HH:mm:ss",
      description: "Date or time display style."
    },
    {
      "id": "duration",
      "label": "Is Duration",
      "type": "boolean",
      "defaultValue": false,
      description: "Treat the input as a duration instead of a date."
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Formatted time",
      "type": "string",
      description: "Formatted date, time, or duration text."
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean",
      description: "True when the input and formatting options are valid."
    }
  ]
};
