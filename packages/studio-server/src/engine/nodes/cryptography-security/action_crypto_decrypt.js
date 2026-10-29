export default {
  "description": "Decrypts and verifies AES-256-GCM authenticated envelopes",
  "type": "action_crypto_decrypt",
  "category": "Cryptography & Security",
  "label": "AES-256-GCM Decrypt",
  "color": "#0f766e",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "ciphertext",
      "label": "Encrypted Envelope",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "passphrase",
      "label": "Passphrase (Optional)",
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
      "id": "plaintext",
      "label": "Plaintext",
      "type": "string"
    }
  ]
};
