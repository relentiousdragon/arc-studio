# Gateway events and intents

Chezcord sends the configured intent bitfield when it identifies with Discord. Intents choose event groups, not callback names. Discord also requires privileged intents to be enabled for the application in the Discord Dev Portal. `GUILD_MEMBERS`, `GUILD_PRESENCES`, and `MESSAGE_CONTENT` are privileged.

## Choosing intents

Use `GatewayIntents` to combine only the event groups the bot needs.

```js
import { Client, GatewayIntents } from 'chezcord';

const client = new Client({
  token: process.env.DISCORD_BOT_TOKEN,
  intents: GatewayIntents.GUILDS
    | GatewayIntents.GUILD_MESSAGES
    | GatewayIntents.MESSAGE_CONTENT
});
```

The runtime catalog pairs each Gateway event with its payload type name and required intents. Payload type names refer to entries in `GatewayDispatchPayloadMap`. It also records conditional intent requirrements, privileged intent labels, and application flag bits. ARC Studio derives event node requirements and intent warnings from this same catalog.

```js
import { GatewayEventCatalog } from 'chezcord/gateway-events';

const messageEvent = GatewayEventCatalog.MESSAGE_CREATE;
console.log(messageEvent.payloadType, messageEvent.intents);
```

| Intent | Gateway events | Privileged |
| --- | --- | --- |
| `GUILDS` | `GUILD_CREATE`, `GUILD_UPDATE`, `GUILD_DELETE`, `GUILD_ROLE_CREATE`, `GUILD_ROLE_UPDATE`, `GUILD_ROLE_DELETE`, `CHANNEL_CREATE`, `CHANNEL_UPDATE`, `CHANNEL_DELETE`, `CHANNEL_PINS_UPDATE`, `THREAD_CREATE`, `THREAD_UPDATE`, `THREAD_DELETE`, `THREAD_LIST_SYNC`, `THREAD_MEMBER_UPDATE`, `THREAD_MEMBERS_UPDATE`, `STAGE_INSTANCE_CREATE`, `STAGE_INSTANCE_UPDATE`, `STAGE_INSTANCE_DELETE`, `VOICE_CHANNEL_STATUS_UPDATE`, `VOICE_CHANNEL_START_TIME_UPDATE` | No |
| `GUILD_MEMBERS` | `GUILD_MEMBER_ADD`, `GUILD_MEMBER_UPDATE`, `GUILD_MEMBER_REMOVE`, expanded `THREAD_MEMBERS_UPDATE` | Yes |
| `GUILD_MODERATION` | `GUILD_AUDIT_LOG_ENTRY_CREATE`, `GUILD_BAN_ADD`, `GUILD_BAN_REMOVE` | No |
| `GUILD_EXPRESSIONS` | `GUILD_EMOJIS_UPDATE`, `GUILD_STICKERS_UPDATE`, `GUILD_SOUNDBOARD_SOUND_CREATE`, `GUILD_SOUNDBOARD_SOUND_UPDATE`, `GUILD_SOUNDBOARD_SOUND_DELETE`, `GUILD_SOUNDBOARD_SOUNDS_UPDATE`. `GUILD_EMOJIS_AND_STICKERS` is a legacy alias for this bit | No |
| `GUILD_INTEGRATIONS` | `GUILD_INTEGRATIONS_UPDATE`, `INTEGRATION_CREATE`, `INTEGRATION_UPDATE`, `INTEGRATION_DELETE` | No |
| `GUILD_WEBHOOKS` | `WEBHOOKS_UPDATE` | No |
| `GUILD_INVITES` | `INVITE_CREATE`, `INVITE_DELETE` | No |
| `GUILD_VOICE_STATES` | `VOICE_CHANNEL_EFFECT_SEND`, `VOICE_STATE_UPDATE` | No |
| `GUILD_PRESENCES` | `PRESENCE_UPDATE` | Yes |
| `GUILD_MESSAGES` | `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `MESSAGE_DELETE_BULK` in guild channels | No |
| `GUILD_MESSAGE_REACTIONS` | `MESSAGE_REACTION_ADD`, `MESSAGE_REACTION_REMOVE`, `MESSAGE_REACTION_REMOVE_ALL`, `MESSAGE_REACTION_REMOVE_EMOJI` in guild channels | No |
| `GUILD_MESSAGE_TYPING` | `TYPING_START` in guild channels | No |
| `DIRECT_MESSAGES` | `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `CHANNEL_PINS_UPDATE` in direct messages | No |
| `DIRECT_MESSAGE_REACTIONS` | `MESSAGE_REACTION_ADD`, `MESSAGE_REACTION_REMOVE`, `MESSAGE_REACTION_REMOVE_ALL`, `MESSAGE_REACTION_REMOVE_EMOJI` in direct messages | No |
| `DIRECT_MESSAGE_TYPING` | `TYPING_START` in direct messages | No |
| `MESSAGE_CONTENT` | No event of its own. Controls access to restricted message fields such as text, embeds, attachments, components, and poll data | Yes |
| `GUILD_SCHEDULED_EVENTS` | `GUILD_SCHEDULED_EVENT_CREATE`, `GUILD_SCHEDULED_EVENT_UPDATE`, `GUILD_SCHEDULED_EVENT_DELETE`, `GUILD_SCHEDULED_EVENT_USER_ADD`, `GUILD_SCHEDULED_EVENT_USER_REMOVE` | No |
| `AUTO_MODERATION_CONFIGURATION` | `AUTO_MODERATION_RULE_CREATE`, `AUTO_MODERATION_RULE_UPDATE`, `AUTO_MODERATION_RULE_DELETE` | No |
| `AUTO_MODERATION_EXECUTION` | `AUTO_MODERATION_ACTION_EXECUTION` | No |
| `GUILD_MESSAGE_POLLS` | `MESSAGE_POLL_VOTE_ADD`, `MESSAGE_POLL_VOTE_REMOVE` in guild channels | No |
| `DIRECT_MESSAGE_POLLS` | `MESSAGE_POLL_VOTE_ADD`, `MESSAGE_POLL_VOTE_REMOVE` in direct messages | No |

Events that are not listed under an intent do not need one. examples include `READY`, `RESUMED`, `INTERACTION_CREATE`, and `USER_UPDATE`.


`GUILD_MEMBER_UPDATE` can still arrive for the bot's own member even without `GUILD_MEMBERS`. `THREAD_MEMBERS_UPDATE` includes other users only when `GUILD_MEMBERS` is enabled. `GUILD_MEMBERS_CHUNK` arrives in response to a member request, and requesting the full member list requires the privileged `GUILD_MEMBERS` intent. Guild member and presence events are disabled by default unless the privileged intents are enabled in the Developer Portal.

## Convenience events

Chezcord emits these aliases from `Client`:

| Client event | Discord dispatch | Intent |
| --- | --- | --- |
| `ready` | `READY` | None |
| `messageCreate` | `MESSAGE_CREATE` | `GUILD_MESSAGES` or `DIRECT_MESSAGES` |
| `interactionCreate` | `INTERACTION_CREATE` | None |
| `guildCreate` | `GUILD_CREATE` | `GUILDS` |
| `guildMemberAdd` | `GUILD_MEMBER_ADD` | `GUILD_MEMBERS` |

The client also forwards these dispatch names directly with their names: `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `MESSAGE_REACTION_ADD`, `MESSAGE_REACTION_REMOVE`, `CHANNEL_CREATE`, `CHANNEL_UPDATE`, `CHANNEL_DELETE`, `GUILD_MEMBER_REMOVE`, `VOICE_STATE_UPDATE`, `PRESENCE_UPDATE`, `GUILD_BAN_ADD`, `GUILD_BAN_REMOVE`, `GUILD_SCHEDULED_EVENT_CREATE`, `GUILD_SCHEDULED_EVENT_UPDATE`, `GUILD_SCHEDULED_EVENT_DELETE`, `AUTO_MODERATION_ACTION_EXECUTION`, `GUILD_CREATE`, `GUILD_UPDATE`, `GUILD_DELETE`, `GUILD_ROLE_CREATE`, `GUILD_ROLE_UPDATE`, `GUILD_ROLE_DELETE`, `THREAD_CREATE`, `THREAD_UPDATE`, `THREAD_DELETE`, `TYPING_START`, `CHANNEL_PINS_UPDATE`, `MESSAGE_REACTION_REMOVE_ALL`, `INVITE_CREATE`, and `INVITE_DELETE`.

## Listening to any dispatch

`gatewayDispatch` receives every raw dispatch name and payload, including events that do not have a convenience event on `Client`.

```js
client.on('gatewayDispatch', (eventName, payload) => {
  if (eventName === 'GUILD_AUDIT_LOG_ENTRY_CREATE') {
    console.log(payload);
  }
});
```

Use `gatewayDispatch` for newer events, events without a direct client alias, or when your code needs the Discord payload. `interactionCreate` has `reply()`, `deferReply()`, `deferUpdate()`, and `editReply()` methods.

## Interaction responses

An interaction can receive one initial acknowledgement. Call `reply()`, `deferReply()`, or `deferUpdate()` once. After deferring a reply, use `editReply()` to fill in the original response.

```js
client.on('interactionCreate', async (interaction) => {
  if (interaction.data?.name !== 'ping') return;
  await interaction.reply('Pong');
});
```

```js
client.on('interactionCreate', async (interaction) => {
  await interaction.deferReply({ ephemeral: true });
  const result = await doSlowWork();
  await interaction.editReply(`Finished: ${result}`);
});
```

The helper methods use Chezcord's REST client and its duplicate acknowledgement guard. `editReply()` requires an earlier acknowledgement made through the interaction helpers. For code that acknowledges through `client.rest` directly, use `client.rest.editOriginalInteractionResponse()` with the application ID and interaction token.

- [Discord Docs Gateway intents and restrictionns](https://docs.discord.com/developers/events/gateway#gateway-intents)
- [Discord Docs Gateway event reference](https://docs.discord.com/developers/events/gateway-events)
