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
      "type": "exec",
      description: "Starts encryption of the input text."
    },
    {
      "id": "plaintext",
      "label": "Plaintext",
      "type": "string",
      "defaultValue": "",
      description: "Text to encrypt into an authenticated envelope."
    },
    {
      "id": "passphrase",
      "label": "Passphrase (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional passphrase used to derive the encryption key."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after encryption finishes."
    },
    {
      "id": "ciphertext",
      "label": "Encrypted Envelope",
      "type": "string",
      description: "AES-256-GCM envelope containing the encrypted text."
    }
  ]
};
