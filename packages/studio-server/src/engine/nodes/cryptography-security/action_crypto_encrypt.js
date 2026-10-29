export default {
  "description": "Encrypts data using authenticated AES-256-GCM with PBKDF2",
  "type": "action_crypto_encrypt",
  "category": "Cryptography & Security",
  "label": "AES-256-GCM Encrypt",
  "color": "#0d9488",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "plaintext",
      "label": "Plaintext",
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
      "id": "ciphertext",
      "label": "Encrypted Envelope",
      "type": "string"
    }
  ]
};
