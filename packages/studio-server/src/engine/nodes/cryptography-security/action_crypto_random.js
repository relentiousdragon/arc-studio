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
      "type": "exec",
      description: "Starts secure token generation."
    },
    {
      "id": "type",
      "label": "Format (hex/base64url/pin)",
      "type": "string",
      "defaultValue": "hex",
      description: "Format for the generated token or PIN."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after the token is generated."
    },
    {
      "id": "token",
      "label": "Token / PIN",
      "type": "string",
      description: "Cryptographically secure token or numeric PIN."
    }
  ]
};
