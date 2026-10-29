export default {
  "description": "Generates secure cryptographic random hex, base64url tokens or numeric PINs",
  "type": "action_crypto_random",
  "category": "Cryptography & Security",
  "label": "Generate Crypto Token",
  "color": "#14b8a6",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "type",
      "label": "Format (hex/base64url/pin)",
      "type": "string",
      "defaultValue": "hex"
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "token",
      "label": "Token / PIN",
      "type": "string"
    }
  ]
};
