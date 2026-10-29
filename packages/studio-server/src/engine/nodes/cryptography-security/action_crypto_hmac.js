export default {
  "description": "Generates HMAC signatures for API & webhook verification",
  "type": "action_crypto_hmac",
  "category": "Cryptography & Security",
  "label": "HMAC Sign",
  "color": "#059669",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "data",
      "label": "Payload",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "secret",
      "label": "Secret Key",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "algorithm",
      "label": "Algorithm",
      "type": "string",
      "defaultValue": "sha256"
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "signature",
      "label": "Signature",
      "type": "string"
    }
  ]
};
