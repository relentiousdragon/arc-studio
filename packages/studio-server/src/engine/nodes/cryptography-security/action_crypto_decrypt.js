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
      "type": "exec",
      description: "Starts decryption of the encrypted envelope."
    },
    {
      "id": "ciphertext",
      "label": "Encrypted Envelope",
      "type": "string",
      "defaultValue": "",
      description: "AES-256-GCM envelope to decrypt and authenticate."
    },
    {
      "id": "passphrase",
      "label": "Passphrase (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional passphrase used to derive the decryption key."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after decryption finishes."
    },
    {
      "id": "plaintext",
      "label": "Plaintext",
      "type": "string",
      description: "Authenticated plaintext from the envelope."
    }
  ]
};
