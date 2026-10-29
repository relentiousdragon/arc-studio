export default {
  "description": "Runs when bot startup begins. Optionally wait for the Gateway to connect.",
  "type": "event_bot_startup",
  "category": "Events",
  "label": "On Bot Startup",
  "color": "#5865F2",
  "gatewayEvent": "BOT_STARTUP",
  "gatewayIntents": [],
  "editorControls": [
    {
      "type": "checkbox",
      "key": "wait_for_gateway",
      "inputId": "wait_for_gateway",
      "label": "Wait for Gateway connection",
      "defaultValue": false,
      "hideWhenConnected": true
    },
    {
      "type": "number",
      "key": "timeout_seconds",
      "inputId": "timeout_seconds",
      "label": "Gateway timeout (seconds)",
      "defaultValue": 30,
      "min": 0,
      "max": 86400,
      "step": 1,
      "integer": true,
      "hideWhenConnected": true
    },
    {
      "type": "hint",
      "text": "A timeout of 0 waits indefinitely. If the timeout expires, the event continues with Gateway Connected set to false."
    }
  ],
  "inputs": [
    {
      "id": "wait_for_gateway",
      "label": "Wait for Gateway",
      "type": "boolean",
      "defaultValue": false
    },
    {
      "id": "timeout_seconds",
      "label": "Gateway Timeout (seconds)",
      "type": "number",
      "defaultValue": 30
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "gateway_connected",
      "label": "Gateway Connected",
      "type": "boolean",
      "eventPath": "gatewayConnected"
    }
  ]
};
