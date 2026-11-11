export default {
  "description": "Runs on a cron schedule",
  "type": "event_cron",
  "category": "Events",
  "label": "On Schedule",
  "color": "#5865F2",
  "gatewayEvent": "CRON_TICK",
  "gatewayIntents": [],
  "editorControls": [
    {
      "type": "text",
      "key": "cronExpression",
      "label": "Cron (min hour day month weekday)",
      "defaultValue": "*/5 * * * *",
      "placeholder": "*/5 * * * *"
    },
    {
      "type": "text",
      "key": "timeZone",
      "label": "Time zone",
      "defaultValue": "UTC",
      "placeholder": "UTC or Asia/Tokyo"
    },
    {
      "type": "hint",
      "text": "Five-field cron. Runs once per matching minute, use an IANA time zone."
    }
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs on the configured cron schedule."},
    {
      "id": "scheduled_at",
      "label": "Scheduled At",
      "type": "string",
      "eventPath": "scheduledAt",
      description: "Time this schedule fired."},
    {
      "id": "time_zone",
      "label": "Time Zone",
      "type": "string",
      "eventPath": "timeZone",
      description: "Time zone used to evaluate the schedule."}
  ]
};
