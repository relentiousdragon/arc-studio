export default {
  "description": "Computes SHA-256 or SHA-512 cryptographic hash digests",
  "type": "action_crypto_hash",
  "category": "Cryptography & Security",
  "label": "Cryptographic Hash",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts digest calculation."
    },
    {
      "id": "data",
      "label": "Input Data",
      "type": "string",
      "defaultValue": "",
      description: "Text to hash."
    },
    {
      "id": "algorithm",
      "label": "Algorithm",
      "type": "string",
      "defaultValue": "sha256",
      description: "Hash algorithm used to create the digest."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after the digest is calculated."
    },
    {
      "id": "hash",
      "label": "Hash Digest",
      "type": "string",
      description: "Hexadecimal cryptographic digest of the input."
    }
  ]
};
