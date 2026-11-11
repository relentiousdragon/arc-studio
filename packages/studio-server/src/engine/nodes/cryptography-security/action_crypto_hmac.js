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
      "type": "exec",
      description: "Starts HMAC signing."
    },
    {
      "id": "data",
      "label": "Payload",
      "type": "string",
      "defaultValue": "",
      description: "Text to sign."
    },
    {
      "id": "secret",
      "label": "Secret Key",
      "type": "string",
      "defaultValue": "",
      description: "Secret key used to create the signature."
    },
    {
      "id": "algorithm",
      "label": "Algorithm",
      "type": "string",
      "defaultValue": "sha256",
      description: "Hash algorithm used for HMAC."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after the signature is created."
    },
    {
      "id": "signature",
      "label": "Signature",
      "type": "string",
      description: "Hexadecimal HMAC signature for the input text."
    }
  ]
};
