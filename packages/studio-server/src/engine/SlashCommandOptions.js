export const SLASH_OPTION_TYPES = Object.freeze({
  subcommand: 1,
  subcommandGroup: 2,
  string: 3,
  integer: 4,
  boolean: 5,
  user: 6,
  channel: 7,
  role: 8,
  mentionable: 9,
  number: 10,
  attachment: 11
});

export const SLASH_PARAMETER_TYPES = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11]);
export const SLASH_AUTOCOMPLETE_TYPES = new Set([3, 4, 10]);
export const SLASH_CHOICE_TYPES = new Set([3, 4, 10]);
const SLASH_NAME_PATTERN = /^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;

export function isValidSlashName(value) {
  const name = String(value ?? '');
  return SLASH_NAME_PATTERN.test(name) && name === name.toLowerCase();
}

export function slashOptionPath(option, path = []) {
  return [...path, String(option?.name || '')];
}

export function slashOptionPinId(path) {
  if (path.length === 1) return `option_${path[0]}`;
  return `option_path_${path.join('.')}`;
}

export function flattenSlashParameters(options = [], path = [], output = []) {
  for (const option of Array.isArray(options) ? options : []) {
    const type = Number(option?.type || 3);
    if (type === SLASH_OPTION_TYPES.subcommand || type === SLASH_OPTION_TYPES.subcommandGroup) {
      flattenSlashParameters(option.options, [...path, String(option.name || '')], output);
    } else if (SLASH_PARAMETER_TYPES.has(type)) {
      const optionPath = [...path, String(option.name || '')];
      output.push({ option, path: optionPath, pinId: slashOptionPinId(optionPath) });
    }
  }
  return output;
}

export function findSlashParameter(options = [], path = []) {
  if (!path.length) return null;
  let entries = Array.isArray(options) ? options : [];
  let found = null;
  for (const name of path) {
    found = entries.find((option) => String(option?.name || '') === name);
    if (!found) return null;
    entries = Array.isArray(found.options) ? found.options : [];
  }
  return found && SLASH_PARAMETER_TYPES.has(Number(found.type)) ? found : null;
}

export function getFocusedSlashOptionPath(options = [], path = []) {
  for (const option of Array.isArray(options) ? options : []) {
    const nextPath = [...path, String(option?.name || '')];
    if (option?.focused) return nextPath;
    const nested = getFocusedSlashOptionPath(option?.options, nextPath);
    if (nested) return nested;
  }
  return null;
}

export function findFocusedSlashOption(options = []) {
  for (const option of Array.isArray(options) ? options : []) {
    if (option?.focused) return option;
    const nested = findFocusedSlashOption(option?.options);
    if (nested) return nested;
  }
  return null;
}

function validateParameter(option, prefix, errors) {
  const name = String(option.name || '').trim();
  const description = String(option.description || '').trim();
  const type = Number(option.type || 3);
  if (!isValidSlashName(name)) errors.push(`${prefix} has an invalid name. Use 1–32 lowercase Unicode letters or numbers, underscores, hyphens, or apostrophes. Spaces are not allowed.`);
  if (!description || Array.from(description).length > 100) errors.push(`${prefix}${name ? ` “${name}”` : ''} needs a description from 1 to 100 characters.`);
  if (!SLASH_PARAMETER_TYPES.has(type)) {
    errors.push(`${prefix}${name ? ` “${name}”` : ''} uses an unsupported parameter type.`);
    return;
  }
  if (option.autocomplete && !SLASH_AUTOCOMPLETE_TYPES.has(type)) errors.push(`${prefix} “${name}” can use autocomplete only with text, integer, or number types.`);
  if (option.dynamicAutocomplete && !option.autocomplete) errors.push(`${prefix} “${name}” must enable autocomplete to use graph-generated suggestions.`);
  if (option.autocomplete && option.dynamicAutocomplete && Array.isArray(option.choices) && option.choices.length) errors.push(`${prefix} “${name}” cannot combine graph-generated autocomplete with fixed choices.`);
  if (option.autocomplete && !option.dynamicAutocomplete && (!Array.isArray(option.choices) || option.choices.length === 0)) errors.push(`${prefix} “${name}” needs graph-generated suggestions.`);
  const choices = Array.isArray(option.choices) ? option.choices : [];
  if (choices.length > 25) errors.push(`${prefix} “${name}” can have at most 25 choices.`);
  if (choices.length && !SLASH_CHOICE_TYPES.has(type)) errors.push(`${prefix} “${name}” cannot have choices for this type.`);
  const values = new Set();
  for (const choice of choices) {
    const choiceName = String(choice?.name || '').trim();
    const choiceValue = choice?.value;
    if (!choiceName || Array.from(choiceName).length > 100 || choiceValue === undefined || choiceValue === null || String(choiceValue).length > 100) {
      errors.push(`${prefix} “${name}” has a choice with an invalid name or value.`);
      break;
    }
    if (type === 4 && (!Number.isSafeInteger(Number(choiceValue)) || !Number.isInteger(Number(choiceValue)))) {
      errors.push(`${prefix} “${name}” has a choice that is not a safe integer.`);
      break;
    }
    if (type === 10 && !Number.isFinite(Number(choiceValue))) {
      errors.push(`${prefix} “${name}” has a choice that is not a finite number.`);
      break;
    }
    const key = String(choiceValue);
    if (values.has(key)) {
      errors.push(`${prefix} “${name}” has duplicate choice values.`);
      break;
    }
    values.add(key);
  }
  if (type === 7 && option.channel_types !== undefined
    && (!Array.isArray(option.channel_types) || option.channel_types.some((channelType) => !Number.isInteger(channelType)))) {
    errors.push(`${prefix} “${name}” has invalid channel type filters.`);
  }
  const supportsBounds = type === 3 || type === 4 || type === 10;
  const minKey = type === 3 ? 'min_length' : 'min_value';
  const maxKey = type === 3 ? 'max_length' : 'max_value';
  for (const key of [minKey, maxKey]) {
    if (option[key] === undefined) continue;
    const value = Number(option[key]);
    const valid = supportsBounds && Number.isFinite(value)
      && (type === 3 ? Number.isInteger(value) && value >= 0 && value <= 6000
        : type === 4 ? Number.isSafeInteger(value) : true);
    if (!valid) errors.push(`${prefix} “${name}” has an invalid ${key.replace('_', ' ')}.`);
  }
  if (option[minKey] !== undefined && option[maxKey] !== undefined && Number(option[minKey]) > Number(option[maxKey])) {
    errors.push(`${prefix} “${name}” has a minimum greater than its maximum.`);
  }
}

export function validateSlashCommandOptions(options, commandName = '') {
  const pathLabel = commandName ? `/${commandName}` : 'Slash command';
  const errors = [];
  if (!Array.isArray(options)) return [`${pathLabel} arguments must be a list.`];
  if (options.length > 25) errors.push(`${pathLabel} can have at most 25 options at each level.`);
  const hasStructure = options.some((option) => [1, 2].includes(Number(option?.type)));
  const hasParameters = options.some((option) => SLASH_PARAMETER_TYPES.has(Number(option?.type || 3)));
  if (hasStructure && hasParameters) errors.push(`${pathLabel} cannot mix subcommands or groups with direct arguments.`);
  const names = new Set();
  for (const option of options) {
    if (!option || typeof option !== 'object' || Array.isArray(option)) {
      errors.push(`${pathLabel} contains an invalid option.`);
      continue;
    }
    const name = String(option.name || '').trim();
    const description = String(option.description || '').trim();
    const type = Number(option.type || 3);
    const optionPath = `${pathLabel} ${name || '(unnamed)'}`;
    if (names.has(name)) errors.push(`${pathLabel} uses “${name}” more than once at the same level.`);
    names.add(name);
    if (type === 1 || type === 2) {
      if (!isValidSlashName(name)) errors.push(`${optionPath} has an invalid name. Use 1–32 lowercase Unicode letters or numbers, underscores, hyphens, or apostrophes. Spaces are not allowed.`);
      if (!description || Array.from(description).length > 100) errors.push(`${optionPath} needs a description from 1 to 100 characters.`);
      if (option.required || option.autocomplete || option.choices?.length) errors.push(`${optionPath} cannot use required, choices, or autocomplete settings.`);
      if (type === 2 && (!Array.isArray(option.options) || option.options.length === 0)) errors.push(`${optionPath} needs at least one subcommand.`);
      if (Array.isArray(option.options) && option.options.length > 25) errors.push(`${optionPath} can have at most 25 nested options.`);
      if (type === 2) {
        const subcommandNames = new Set();
        for (const child of Array.isArray(option.options) ? option.options : []) {
          if (Number(child?.type) !== 1) {
            errors.push(`${optionPath} can contain subcommands only. Groups cannot be nested.`);
            continue;
          }
          const childName = String(child?.name || '').trim();
          if (subcommandNames.has(childName)) errors.push(`${optionPath} uses subcommand “${childName}” more than once.`);
          subcommandNames.add(childName);
          validateSlashSubcommand(child, optionPath, errors);
        }
      } else validateSlashParameters(option.options, optionPath, errors);
    } else validateParameter(option, `${pathLabel} argument`, errors);
  }
  return errors;
}

function validateSlashSubcommand(option, parentPath, errors) {
  const name = String(option.name || '').trim();
  const description = String(option.description || '').trim();
  const path = `${parentPath} ${name || '(unnamed)'}`;
  if (!isValidSlashName(name)) errors.push(`${path} has an invalid name. Use 1–32 lowercase Unicode letters or numbers, underscores, hyphens, or apostrophes. Spaces are not allowed.`);
  if (!description || Array.from(description).length > 100) errors.push(`${path} needs a description from 1 to 100 characters.`);
  if (option.required || option.autocomplete || option.choices?.length) errors.push(`${path} cannot use required, choices, or autocomplete settings.`);
  if (Array.isArray(option.options) && option.options.length > 25) errors.push(`${path} can have at most 25 arguments.`);
  validateSlashParameters(option.options || [], path, errors);
}

function validateSlashParameters(options, parentPath, errors) {
  if (!Array.isArray(options)) return;
  if (options.length > 25) errors.push(`${parentPath} can have at most 25 arguments.`);
  const names = new Set();
  let foundOptional = false;
  for (const option of options) {
    if (!option || typeof option !== 'object' || Array.isArray(option)) {
      errors.push(`${parentPath} contains an invalid argument.`);
      continue;
    }
    const name = String(option.name || '').trim();
    if (names.has(name)) errors.push(`${parentPath} uses argument “${name}” more than once.`);
    names.add(name);
    if (Number(option.type) === 1 || Number(option.type) === 2) {
      errors.push(`${parentPath} arguments cannot contain nested subcommands or groups.`);
      continue;
    }
    if (!option.required) foundOptional = true;
    else if (foundOptional) errors.push(`${parentPath} has a required argument after an optional argument. Move required arguments first.`);
    validateParameter(option, `${parentPath} argument`, errors);
  }
}

export function normalizeSlashCommandOptions(options = []) {
  const normalize = (items) => (Array.isArray(items) ? items : []).map((option) => {
    const type = Number(option?.type || 3);
    const base = {
      type,
      name: String(option?.name || '').trim().toLowerCase(),
      description: String(option?.description || '').trim()
    };
    if (type === 1 || type === 2) {
      for (const key of ['name_localizations', 'description_localizations']) {
        if (option[key] !== undefined) base[key] = option[key];
      }
      return { ...base, ...(Array.isArray(option.options) && option.options.length ? { options: normalize(option.options) } : {}) };
    }
    if (option.required) base.required = true;
    if (option.autocomplete && option.dynamicAutocomplete) base.autocomplete = true;
    else if (Array.isArray(option.choices) && option.choices.length) base.choices = option.choices.map((choice) => ({
      name: String(choice.name || '').trim().slice(0, 100),
      value: type === 4 ? Number(choice.value) : type === 10 ? Number(choice.value) : String(choice.value ?? '').slice(0, 100)
    }));
    for (const key of ['channel_types', 'min_value', 'max_value', 'min_length', 'max_length', 'name_localizations', 'description_localizations']) {
      if (option[key] !== undefined && !(key === 'channel_types' && Array.isArray(option[key]) && option[key].length === 0)) base[key] = option[key];
    }
    return base;
  });
  const sortRequired = (items) => items.map((item) => {
    if (item.type === 1) return { ...item, options: sortRequired(item.options || []) };
    if (item.type === 2) return { ...item, options: (item.options || []).map((subcommand) => ({ ...subcommand, options: sortRequired(subcommand.options || []) })) };
    return item;
  }).sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)));
  return sortRequired(normalize(options));
}
