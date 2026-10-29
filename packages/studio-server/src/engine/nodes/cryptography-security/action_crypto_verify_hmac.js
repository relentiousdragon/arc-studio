export default {
  "description": "Constant-time verification of HMAC signatures",
  "type": "action_crypto_verify_hmac",
  "category": "Cryptography & Security",
  "label": "Verify HMAC",
  "color": "#047857",
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
      "id": "signature",
      "label": "Expected Signature",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "isValid",
      "label": "Is Valid",
      "type": "boolean"
    }
  ]
};
