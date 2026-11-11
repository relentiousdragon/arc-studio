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
      "type": "exec",
      description: "Starts downloading the file."
    },
    {
      "id": "url",
      "label": "URL",
      "type": "string",
      "defaultValue": "",
      description: "Public HTTP or HTTPS URL of the file."
    },
    {
      "id": "user_agent",
      "label": "User-Agent",
      "type": "string",
      "defaultValue": "",
      description: "User-Agent header sent with the request."
    },
    {
      "id": "timeout_ms",
      "label": "Timeout (ms)",
      "type": "number",
      "defaultValue": 20000,
      description: "Maximum time to wait for the download, in milliseconds."
    },
    {
      "id": "max_bytes",
      "label": "Max file bytes",
      "type": "number",
      "defaultValue": 20971520,
      description: "Maximum number of file bytes to download."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after the download completes."
    },
    {
      "id": "file",
      "label": "File",
      "type": "object",
      description: "Downloaded file data for a message or interaction reply."
    },
    {
      "id": "filename",
      "label": "File Name",
      "type": "string",
      description: "Suggested file name from the response or URL."
    },
    {
      "id": "content_type",
      "label": "Content Type",
      "type": "string",
      description: "MIME type reported for the downloaded file."
    },
    {
      "id": "byte_size",
      "label": "Bytes",
      "type": "number",
      description: "Size of the downloaded file in bytes."
    },
    {
      "id": "error",
      "label": "Error",
      "type": "string",
      description: "Download error message, if the request failed."
    }
  ]
};
