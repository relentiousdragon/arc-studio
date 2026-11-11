export default {
  description: 'A modal is submitted',
  type: 'event_modal_submit',
  category: 'Events',
  label: 'On Modal Submitted',
  color: '#5865F2',
  gatewayEvent: 'INTERACTION_CREATE',
  gatewayIntents: [],
  gatewayInteractionType: 5,
  defaultData: {
    custom_id: ''
  },
  inputs: [],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Runs when a modal is submitted."},
    { id: 'message', label: 'Source Message Object', type: 'object', eventPath: 'message', description: "The message containing the submitted component."},
    { id: 'message_id', label: 'Message ID', type: 'string', eventPath: 'message.id', description: "ID of the message tied to this event."},
    { id: 'custom_id', label: 'Custom ID', type: 'string', eventPath: 'data.custom_id', description: "Custom ID of the submitted component."},
    { id: 'submitted_values', label: 'Submitted Values', type: 'object', eventPath: 'data.components', description: "Values submitted in the modal, keyed by field ID."},
    { id: 'user_id', label: 'User ID', type: 'string', eventPath: 'member.user.id', description: "ID of the user who triggered or was affected by the event."},
    { id: 'guild_id', label: 'Server ID', type: 'string', eventPath: 'guild_id', description: "ID of the server where the event occurred."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', eventPath: 'channel_id', description: "ID of the channel where the event occurred."},
    { id: 'thread_id', label: 'Thread ID', type: 'string', description: "ID of the thread where the event occurred."},
    { id: 'application_id', label: 'Application ID', type: 'string', eventPath: 'application_id', description: "ID of the application that received the interaction."},
    { id: 'interaction_id', label: 'Interaction ID', type: 'string', eventPath: 'id', description: "ID of the interaction."},
    { id: 'interaction_token', label: 'Interaction Token', type: 'string', eventPath: 'token', description: "Token used to respond to the interaction."}
  ]
};
