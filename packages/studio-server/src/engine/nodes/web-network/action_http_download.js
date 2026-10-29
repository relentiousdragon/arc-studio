export default {
  "description": "Downloads a public file over HTTP or HTTPS as a bounded binary attachment. Connect File to a message or interaction reply Files input.",
  "type": "action_http_download",
  "category": "Web & Network",
  "label": "HTTP Download File",
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
      "id": "user_agent",
      "label": "User-Agent",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "timeout_ms",
      "label": "Timeout (ms)",
      "type": "number",
      "defaultValue": 20000
    },
    {
      "id": "max_bytes",
      "label": "Max file bytes",
      "type": "number",
      "defaultValue": 20971520
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "file",
      "label": "File",
      "type": "object"
    },
    {
      "id": "filename",
      "label": "File Name",
      "type": "string"
    },
    {
      "id": "content_type",
      "label": "Content Type",
      "type": "string"
    },
    {
      "id": "byte_size",
      "label": "Bytes",
      "type": "number"
    },
    {
      "id": "error",
      "label": "Error",
      "type": "string"
    }
  ]
};
