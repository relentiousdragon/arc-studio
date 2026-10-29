export default {
  "description": "Formats an ISO date or Unix millisecond timestamp using a locale, time zone, and date/time styles.",
  "type": "data_format_time",
  "category": "Values & Data",
  "label": "Format Date & Time",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "value",
      "label": "Date / timestamp",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "locale",
      "label": "Locale",
      "type": "string",
      "defaultValue": "en-US"
    },
    {
      "id": "timeZone",
      "label": "Time zone",
      "type": "string",
      "defaultValue": "UTC"
    },
    {
      "id": "dateStyle",
      "label": "Date style",
      "type": "string",
      "defaultValue": "medium"
    },
    {
      "id": "timeStyle",
      "label": "Time style",
      "type": "string",
      "defaultValue": "short"
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
