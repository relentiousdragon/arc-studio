export default {
  "description": "Deploys workspace slash commands when triggered by a server manager with Manage Server or Administrator.",
  "type": "action_deploy_slash_commands",
  "category": "Discord Actions",
  "label": "Deploy Slash Commands",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "deployed_count",
      "label": "Commands Deployed",
      "type": "number"
    },
    {
      "id": "success",
      "label": "Succeeded",
      "type": "boolean"
    },
    {
      "id": "error",
      "label": "Error",
      "type": "string"
    }
  ]
};
