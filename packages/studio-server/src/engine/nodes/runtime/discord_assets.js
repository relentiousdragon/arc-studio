const SNOWFLAKE = /^\d{17,20}$/;
const NAME = /^[a-zA-Z0-9_]{2,32}$/;
//
function parseIds(value) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = value.split(/[\s,]+/).filter(Boolean); }
  }
  if (!Array.isArray(value) || value.length < 2 || value.length > 100) throw new TypeError('Provide an array of 2 to 100 message IDs.');
  const ids = value.map((item) => String(item?.id || item).trim());
  if (ids.some((id) => !SNOWFLAKE.test(id))) throw new TypeError('Every message ID must be a valid Discord ID.');
  if (new Set(ids).size !== ids.length) throw new TypeError('Message IDs must be unique.');
  return ids;
}

function fileData(file) {
  if (Array.isArray(file)) file = file[0];
  const isString = typeof file === 'string';
  if (!isString && (!file || typeof file !== 'object')) throw new TypeError('Choose a project media file or connect a downloaded file.');
  const data = isString ? file : String(file.data || file.dataUrl || '');
  const match = /^data:([^;,]+);base64,([a-z\d+/]*={0,2})$/i.exec(data);
  const encoded = match ? match[2] : data;
  if (!encoded || !/^[a-z\d+/]*={0,2}$/i.test(encoded) || encoded.length % 4 === 1) throw new TypeError('File input must contain valid base64 data.');
  const bytes = Buffer.from(encoded, 'base64');
  const expectedLength = Math.ceil(encoded.length / 4) * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (!bytes.length || bytes.length !== expectedLength) throw new TypeError('File input contains invalid base64 data.');
  return {
    mime: String(isString ? match?.[1] : file.contentType || match?.[1] || 'application/octet-stream').toLowerCase(),
    bytes,
    filename: String(isString ? 'upload' : file.filename || file.name || 'upload')
  };
}

function validateImage(file, maxBytes = 256 * 1024) {
  const parsed = fileData(file);
  if (!parsed.bytes.length || parsed.bytes.length > maxBytes) throw new RangeError(`File must be no larger than ${Math.floor(maxBytes / 1024)} KiB.`);
  const signatures = {
    'image/png': parsed.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': parsed.bytes[0] === 255 && parsed.bytes[1] === 216 && parsed.bytes.at(-2) === 255 && parsed.bytes.at(-1) === 217,
    'image/gif': ['GIF87a', 'GIF89a'].includes(parsed.bytes.subarray(0, 6).toString('ascii')),
    'image/webp': parsed.bytes.subarray(0, 4).toString('ascii') === 'RIFF' && parsed.bytes.subarray(8, 12).toString('ascii') === 'WEBP',
    'image/apng': parsed.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  };
  if (!Object.hasOwn(signatures, parsed.mime) || !signatures[parsed.mime]) throw new TypeError('The file content does not match a supported image type.');
  return parsed;
}

function imageDataUrl(parsed) {
  const mime = parsed.mime === 'image/apng' ? 'image/png' : parsed.mime;
  return `data:${mime};base64,${parsed.bytes.toString('base64')}`;
}

export async function executeDiscordAssetNode(node, { resolveInput, resolveFiles, rest, client, eventPayload, setOutput, log }) {
  const value = (key, fallback = '') => resolveInput(key, node.data?.[key] ?? fallback);
  if (node.type === 'action_bulk_delete_messages') {
    const channelId = String(value('channel_id')).trim();
    if (!SNOWFLAKE.test(channelId)) throw new TypeError('Bulk Delete Messages needs a valid channel ID.');
    const ids = parseIds(value('message_ids', []));
    await rest.bulkDeleteMessages(channelId, ids, String(value('reason')).trim() || undefined);
    setOutput('deleted_count', ids.length);
    setOutput('success', true);
    log(`[Bulk Delete Messages] Deleted ${ids.length} messages from channel ${channelId}.`);
    return true;
  }

  const rawFile = value('files', []);
  const resolvedFiles = typeof rawFile === 'string' ? rawFile : resolveFiles(rawFile)[0] || rawFile;
  const parsed = node.type === 'action_upload_guild_sticker' ? fileData(resolvedFiles) : validateImage(resolvedFiles);
  const name = String(value('name')).trim();
  if (node.type === 'action_upload_guild_sticker') {
    if (name.length < 2 || name.length > 30) throw new TypeError('Sticker names must be 2 to 30 characters.');
  } else if (!NAME.test(name)) throw new TypeError('Emoji names must be 2 to 32 letters, numbers, or underscores.');
  let emoji;
  if (node.type === 'action_upload_guild_emoji') {
    const guildId = String(value('guild_id')).trim();
    if (!SNOWFLAKE.test(guildId)) throw new TypeError('Upload Server Emoji needs a valid server ID.');
    let roles = value('roles', []);
    if (typeof roles === 'string') { try { roles = JSON.parse(roles); } catch { roles = roles.split(/[\s,]+/).filter(Boolean); } }
    if (!Array.isArray(roles) || roles.some((id) => !SNOWFLAKE.test(String(id)))) throw new TypeError('Role IDs must be an array of valid Discord IDs.');
    emoji = await rest.createGuildEmoji(guildId, { name, image: imageDataUrl(parsed), roles, reason: String(value('reason')).trim() || undefined });
  } else if (node.type === 'action_upload_application_emoji') {
    const applicationId = String(eventPayload?.application_id || client?.application?.id || client?.user?.id || '').trim();
    if (!SNOWFLAKE.test(applicationId)) throw new Error('Discord did not provide the bot application ID.');
    emoji = await rest.createApplicationEmoji(applicationId, { name, image: imageDataUrl(parsed) });
  } else if (node.type === 'action_upload_guild_sticker') {
    const guildId = String(value('guild_id')).trim();
    if (!SNOWFLAKE.test(guildId)) throw new TypeError('Upload Server Sticker needs a valid server ID.');
    const stickerName = name;
    const description = String(value('description')).trim();
    const tags = String(value('tags')).trim();
    if (description && description.length > 100) throw new TypeError('Sticker descriptions must be 100 characters or fewer.');
    if (!tags || tags.length > 200) throw new TypeError('Sticker tags must contain an emoji and be 200 characters or fewer.');
    if (!['image/png', 'image/apng', 'image/gif'].includes(parsed.mime)) throw new TypeError('Sticker uploads support PNG, APNG, or GIF files.');
    if (!parsed.bytes.length || parsed.bytes.length > 512 * 1024) throw new RangeError('Sticker files must be 512 KiB or smaller.');
    if (parsed.mime === 'image/gif' && !['GIF87a', 'GIF89a'].includes(parsed.bytes.subarray(0, 6).toString('ascii'))) throw new TypeError('The file content does not match a GIF image.');
    if (['image/png', 'image/apng'].includes(parsed.mime) && !parsed.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new TypeError('The file content does not match a PNG image.');
    const sticker = await rest.createGuildSticker(guildId, { name: stickerName, description, tags, file: parsed.bytes, filename: parsed.filename, contentType: parsed.mime, reason: String(value('reason')).trim() || undefined });
    setOutput('sticker_id', String(sticker?.id || ''));
    setOutput('sticker_name', String(sticker?.name || stickerName));
    setOutput('success', Boolean(sticker?.id));
    log(`[Upload Server Sticker] Uploaded sticker ${sticker?.name || stickerName} to server ${guildId}.`);
    return true;
  } else return false;
  setOutput('emoji_id', String(emoji?.id || ''));
  setOutput('emoji_name', String(emoji?.name || name));
  setOutput('success', Boolean(emoji?.id));
  log(`[${node.type === 'action_upload_guild_emoji' ? 'Upload Server Emoji' : 'Upload Bot Emoji'}] Uploaded emoji ${emoji?.name || name}.`);
  return true;
}
