export default {
  "description": "Deploys selected workspace application commands globally or to a Discord server when triggered by a server manager.",
  "type": "action_deploy_slash_commands",
  "category": "Discord Actions",
  "label": "Deploy Slash Commands",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts Deploy Slash Commands."},
    {
      "id": "guild_id",
      "label": "Guild ID",
      "type": "string",
      "defaultValue": "",
      "description": "Optional Discord guild ID. Leave blank to deploy globally."
    },
    {
      "id": "command_keys",
      "label": "Commands",
      "type": "array",
      "defaultValue": [],
      "description": "Optional array of type:name keys. An empty array deploys every configured command."
    }
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
