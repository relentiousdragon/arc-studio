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
      "defaultValue": ""
    },
    {
      "id": "timezone",
      "label": "Time zone",
      "type": "string",
      "defaultValue": "UTC"
    },
    {
      "id": "style",
      "label": "Date Format",
      "type": "string",
      "defaultValue": "DD/MM/YYYY - HH:mm:ss"
    },
    {
      "id": "duration",
      "label": "Is Duration",
      "type": "boolean",
      "defaultValue": false
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Formatted time",
      "type": "string"
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean"
    }
  ]
};
