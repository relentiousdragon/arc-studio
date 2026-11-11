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
      "type": "exec",
      description: "Starts Deploy Slash Commands."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after Deploy Slash Commands completes."},
    {
      "id": "deployed_count",
      "label": "Commands Deployed",
      "type": "number",
      description: "Number of slash commands deployed."},
    {
      "id": "success",
      "label": "Succeeded",
      "type": "boolean",
      description: "Whether the action completed successfully."},
    {
      "id": "error",
      "label": "Error",
      "type": "string",
      description: "Error message returned when the action fails."}
  ]
};
