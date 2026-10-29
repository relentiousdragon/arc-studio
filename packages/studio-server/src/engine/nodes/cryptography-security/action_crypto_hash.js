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
      "type": "exec"
    },
    {
      "id": "data",
      "label": "Input Data",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "algorithm",
      "label": "Algorithm",
      "type": "string",
      "defaultValue": "sha256"
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "hash",
      "label": "Hash Digest",
      "type": "string"
    }
  ]
};
