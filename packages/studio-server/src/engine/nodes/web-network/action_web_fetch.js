export default {
  "description": "Make a bounded HTTP request with headers and an optional body. Local/private network destinations and redirects are blocked.",
  "type": "action_web_fetch",
  "category": "Web & Network",
  "label": "HTTP Request",
  "color": "#0ea5e9",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "url",
      "label": "URL",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "method",
      "label": "Method",
      "type": "string",
      "defaultValue": "GET"
    },
    {
      "id": "headers",
      "label": "Headers (JSON)",
      "type": "string",
      "defaultValue": "{}"
    },
    {
      "id": "user_agent",
      "label": "User-Agent",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "body",
      "label": "Body",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "timeout_ms",
      "label": "Timeout (ms)",
      "type": "number",
      "defaultValue": 10000
    },
    {
      "id": "max_bytes",
      "label": "Max response bytes",
      "type": "number",
      "defaultValue": 1048576
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "status",
      "label": "Status",
      "type": "number"
    },
    {
      "id": "ok",
      "label": "2xx",
      "type": "boolean"
    },
    {
      "id": "body",
      "label": "Response Body",
      "type": "string"
    },
    {
      "id": "headers",
      "label": "Response Headers (JSON)",
      "type": "string"
    },
    {
      "id": "json",
      "label": "JSON",
      "type": "object"
    },
    {
      "id": "error",
      "label": "Error",
      "type": "string"
    }
  ]
};
