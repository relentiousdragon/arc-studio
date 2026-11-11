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
      "type": "exec",
      description: "Starts signature verification."
    },
    {
      "id": "data",
      "label": "Payload",
      "type": "string",
      "defaultValue": "",
      description: "Text that was signed."
    },
    {
      "id": "secret",
      "label": "Secret Key",
      "type": "string",
      "defaultValue": "",
      description: "Secret key used to create the expected signature."
    },
    {
      "id": "signature",
      "label": "Expected Signature",
      "type": "string",
      "defaultValue": "",
      description: "HMAC signature to verify."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after the signature is checked."
    },
    {
      "id": "isValid",
      "label": "Is Valid",
      "type": "boolean",
      description: "True when the signature matches the input and secret."
    }
  ]
};
