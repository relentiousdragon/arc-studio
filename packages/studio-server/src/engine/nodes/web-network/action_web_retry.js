export default {
  "description": "Retries temporary network errors and HTTP 408, 425, 429, and 5xx responses with bounded backoff. Non-idempotent methods are not retried unless explicitly enabled.",
  "type": "action_web_retry",
  "category": "Web & Network",
  "label": "HTTP Request (Retry)",
  "color": "#0284c7",
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
    },
    {
      "id": "max_attempts",
      "label": "Max attempts",
      "type": "number",
      "defaultValue": 3
    },
    {
      "id": "retry_delay_ms",
      "label": "Base retry delay (ms)",
      "type": "number",
      "defaultValue": 500
    },
    {
      "id": "retry_non_idempotent",
      "label": "Retry POST/other methods",
      "type": "boolean",
      "defaultValue": false
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
      "id": "attempts",
      "label": "Attempts",
      "type": "number"
    },
    {
      "id": "error",
      "label": "Error",
      "type": "string"
    }
  ]
};
