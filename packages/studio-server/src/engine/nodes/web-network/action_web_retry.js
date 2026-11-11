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
      "type": "exec",
      description: "Starts the retrying HTTP request."
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
      description: "Maximum time for each request attempt, in milliseconds."
    },
    {
      "id": "max_bytes",
      "label": "Max response bytes",
      "type": "number",
      "defaultValue": 1048576,
      description: "Maximum number of response bytes to read."
    },
    {
      "id": "max_attempts",
      "label": "Max attempts",
      "type": "number",
      "defaultValue": 3,
      description: "Maximum number of request attempts."
    },
    {
      "id": "retry_delay_ms",
      "label": "Base retry delay (ms)",
      "type": "number",
      "defaultValue": 500,
      description: "Base delay between retry attempts, in milliseconds."
    },
    {
      "id": "retry_non_idempotent",
      "label": "Retry POST/other methods",
      "type": "boolean",
      "defaultValue": false,
      description: "Allow retries for POST and other non-idempotent methods."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after a request succeeds or retries are exhausted."
    },
    {
      "id": "status",
      "label": "Status",
      "type": "number",
      description: "HTTP status code returned by the final response."
    },
    {
      "id": "ok",
      "label": "Success (2xx)",
      "type": "boolean",
      description: "True when the final response status is in the 2xx range."
    },
    {
      "id": "body",
      "label": "Response Body",
      "type": "string",
      description: "Final response body text."
    },
    {
      "id": "headers",
      "label": "Response Headers (JSON)",
      "type": "string",
      description: "Final response headers encoded as a JSON object."
    },
    {
      "id": "json",
      "label": "JSON",
      "type": "object",
      description: "Parsed JSON from the final response, when valid JSON."
    },
    {
      "id": "attempts",
      "label": "Attempts",
      "type": "number",
      description: "Number of request attempts made."
    },
    {
      "id": "error",
      "label": "Error",
      "type": "string",
      description: "Request error message, if all attempts failed."
    }
  ]
};
