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
      "type": "exec",
      description: "Starts the HTTP request."
    },
    {
      "id": "url",
      "label": "URL",
      "type": "string",
      "defaultValue": "",
      description: "Public HTTP or HTTPS URL to request."
    },
    {
      "id": "method",
      "label": "Method",
      "type": "string",
      "defaultValue": "GET",
      description: "HTTP method used for the request."
    },
    {
      "id": "headers",
      "label": "Headers (JSON)",
      "type": "string",
      "defaultValue": "{}",
      description: "Request headers encoded as a JSON object."
    },
    {
      "id": "user_agent",
      "label": "User-Agent",
      "type": "string",
      "defaultValue": "",
      description: "User-Agent header sent with the request."
    },
    {
      "id": "body",
      "label": "Body",
      "type": "string",
      "defaultValue": "",
      description: "Optional request body text."
    },
    {
      "id": "timeout_ms",
      "label": "Timeout (ms)",
      "type": "number",
      "defaultValue": 10000,
      description: "Maximum time to wait for the response, in milliseconds."
    },
    {
      "id": "max_bytes",
      "label": "Max response bytes",
      "type": "number",
      "defaultValue": 1048576,
      description: "Maximum number of response bytes to read."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after the response is received."
    },
    {
      "id": "status",
      "label": "Status",
      "type": "number",
      description: "HTTP status code returned by the server."
    },
    {
      "id": "ok",
      "label": "Success (2xx)",
      "type": "boolean",
      description: "True when the response status is in the 2xx range."
    },
    {
      "id": "body",
      "label": "Response Body",
      "type": "string",
      description: "Response body text."
    },
    {
      "id": "headers",
      "label": "Response Headers (JSON)",
      "type": "string",
      description: "Response headers encoded as a JSON object."
    },
    {
      "id": "json",
      "label": "JSON",
      "type": "object",
      description: "Parsed JSON response body, when valid JSON."
    },
    {
      "id": "error",
      "label": "Error",
      "type": "string",
      description: "Request error message, if the request failed."
    }
  ]
};
