import { parseEmoji } from 'chezcord';
//
export function buildDiscordComponents(rows = [], renderText = (value) => value) {
  const styles = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 };
  const selectTypes = { string_select: 3, user_select: 5, role_select: 6, mentionable_select: 7, channel_select: 8 };
  const activeRows = (Array.isArray(rows) ? rows : []).filter((row) => Array.isArray(row.components) && row.components.length);
  if (activeRows.length > 5) throw new RangeError('Discord messages support at most 5 legacy action rows.');
  for (const [index, row] of activeRows.entries()) {
    if (row.components.length > 5) throw new RangeError(`Action Row ${index + 1} supports at most 5 buttons or one select menu.`);
    const containsSelect = row.components.some((component) => selectTypes[component?.type]);
    if (containsSelect && row.components.length !== 1) throw new RangeError(`Action Row ${index + 1} can contain only one select menu.`);
  }
  return activeRows.map((row) => ({
    type: 1,
    components: row.components.slice(0, 5).map((component) => selectTypes[component.type] ? {
      type: selectTypes[component.type],
      custom_id: String(renderText(String(component.customId || ''))).slice(0, 100),
      ...(component.placeholder ? { placeholder: String(renderText(String(component.placeholder))).slice(0, 150) } : {}),
      min_values: Math.max(0, Math.min(25, Number(component.minValues) || 0)),
      max_values: Math.max(1, Math.min(25, Number(component.maxValues) || 1)),
      ...(component.type === 'string_select' ? { options: (Array.isArray(component.options) ? component.options : []).slice(0, 25).map((option) => ({
        label: String(renderText(String(option.label || ''))).slice(0, 100), value: String(renderText(String(option.value || ''))).slice(0, 100),
        ...(option.description ? { description: String(renderText(String(option.description))).slice(0, 100) } : {}),
        ...(option.emoji ? { emoji: parseEmoji(option.emoji) } : {})
      })) } : {}),
      ...(component.type === 'channel_select' && Array.isArray(component.channelTypes) && component.channelTypes.length ? { channel_types: component.channelTypes.map(Number).filter(Number.isInteger) } : {})
    } : {
      type: 2, style: styles[component.style] || 1,
      label: String(renderText(String(component.label || ''))).slice(0, 80),
      ...(component.emoji ? { emoji: parseEmoji(component.emoji) } : {}),
      ...(component.style === 'link' ? { url: String(renderText(String(component.url || ''))).slice(0, 512) } : { custom_id: String(renderText(String(component.customId || ''))).slice(0, 100) }),
      disabled: component.style === 'link' ? false : Boolean(component.disabled)
    })
  }));
}

export function buildDiscordComponentsV2(layout = [], renderText = (value) => value) {
  const buildButton = (button) => {
    const style = ({ primary: 1, secondary: 2, success: 3, danger: 4, link: 5 })[button.style] || 1;
    return {
      type: 2, style,
      label: String(renderText(String(button.label || ''))),
      ...(button.emoji ? { emoji: parseEmoji(renderText(String(button.emoji))) } : {}),
      ...(style === 5 ? { url: String(renderText(String(button.url || ''))) } : { custom_id: String(renderText(String(button.customId || ''))) }),
      disabled: Boolean(button.disabled)
    };
  };
  const selectTypes = { string_select: 3, user_select: 5, role_select: 6, mentionable_select: 7, channel_select: 8 };
  const buildSelect = (item) => {
    const type = selectTypes[item.type];
    if (!type) return null;
    return {
      type,
      custom_id: String(renderText(String(item.customId || ''))),
      ...(item.placeholder ? { placeholder: String(renderText(String(item.placeholder))) } : {}),
      min_values: Number(item.minValues ?? 0),
      max_values: Number(item.maxValues ?? 1),
      ...(item.type === 'string_select' ? { options: (Array.isArray(item.options) ? item.options : []).map((option) => ({
        label: String(renderText(String(option.label || ''))),
        value: String(renderText(String(option.value || ''))),
        ...(option.description ? { description: String(renderText(String(option.description))) } : {}),
        ...(option.emoji ? { emoji: parseEmoji(option.emoji) } : {})
      })) } : {}),
      ...(item.type === 'channel_select' && Array.isArray(item.channelTypes) ? { channel_types: item.channelTypes.map(Number) } : {})
    };
  };
  const buildAccessory = (accessory) => accessory?.type === 'button'
    ? buildButton(accessory)
    : accessory?.type === 'thumbnail' ? {
      type: 11,
      media: { url: String(renderText(String(accessory.url || ''))) },
      ...(accessory.description ? { description: String(renderText(String(accessory.description))) } : {}),
      ...(accessory.spoiler ? { spoiler: true } : {})
    } : null;
  const buildItem = (item) => {
    if (!item || typeof item !== 'object') return null;
    if (item.type === 'text_display') return { type: 10, content: String(renderText(String(item.content || ''))) };
    if (item.type === 'separator') return { type: 14, divider: item.divider !== false, spacing: Number(item.spacing) === 2 ? 2 : 1 };
    if (item.type === 'action_row') {
      const rowItems = (Array.isArray(item.components) ? item.components : []).map((child) => selectTypes[child?.type] ? buildSelect(child) : child?.type === 'button' ? buildButton(child) : { type: 0 });
      const row = rowItems.length ? { type: 1, components: rowItems } : null;
      return row || null;
    }
    if (item.type === 'section') {
      return {
        type: 9,
        components: (Array.isArray(item.texts) ? item.texts : []).map((content) => ({ type: 10, content: String(renderText(String(content || ''))) })),
        accessory: buildAccessory(item.accessory)
      };
    }
    if (item.type === 'media_gallery') {
      return { type: 12, items: (Array.isArray(item.items) ? item.items : []).map((media) => ({
        media: { url: String(renderText(String(media.url || ''))) },
        ...(media.description ? { description: String(renderText(String(media.description))) } : {}),
        ...(media.spoiler ? { spoiler: true } : {})
      })) };
    }
    if (item.type === 'file') return {
      type: 13, file: { url: String(renderText(String(item.url || ''))) },
      ...(item.spoiler ? { spoiler: true } : {})
    };
    if (item.type === 'container') return {
      type: 17,
      components: (Array.isArray(item.children) ? item.children : []).map((child) => buildItem(child)),
      ...(item.accentColor ? { accent_color: Math.max(0, Math.min(0xffffff, Number.parseInt(String(item.accentColor).replace(/^#/, ''), 16) || 0)) } : {}),
      ...(item.spoiler ? { spoiler: true } : {})
    };
    return { type: 0 };
  };
  return {
    format: 'arc-components-v2',
    components: (Array.isArray(layout) ? layout : []).map((item) => buildItem(item)).filter(Boolean)
  };
}

export function validateDiscordComponentsV2(value) {
  const root = Array.isArray(value) ? value : value?.format === 'arc-components-v2' ? value.components : null;
  const errors = [];
  if (!Array.isArray(root) || root.length === 0) return ['Add at least one Components V2 block.'];
  const customIds = new Set();
  let count = 0;
  let textLength = 0;
  const addId = (component) => {
    const id = String(component?.custom_id ?? '');
    if (!id.trim()) errors.push('Interactive components need a custom ID.');
    if (id.length > 100) errors.push('Custom IDs must be 100 characters or fewer.');
    if (customIds.has(id)) errors.push(`Custom ID “${id}” is used more than once.`);
    if (id) customIds.add(id);
  };
  const validMediaUrl = (value) => {
    const url = String(value || '').trim();
    if (/^attachment:\/\/[^\s?#]{1,100}$/i.test(url)) return true;
    try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
  };
  const allowedByPlacement = {
    root: new Set([1, 9, 10, 12, 13, 14, 17]),
    container: new Set([1, 9, 10, 12, 13, 14]),
    actionRow: new Set([2, 3, 5, 6, 7, 8]),
    sectionText: new Set([10]),
    sectionAccessory: new Set([2, 11])
  };
  const visit = (component, location = 'Component', placement = 'root') => {
    if (!component || typeof component !== 'object') { errors.push(`${location} is invalid.`); return; }
    count += 1;
    if (!allowedByPlacement[placement]?.has(component.type)) errors.push(`${location} is not allowed in this component position.`);
    if (component.type === 10) {
      const text = String(component.content || '');
      textLength += text.length;
      if (!text.trim()) errors.push(`${location} needs text.`);
      if (text.length > 4000) errors.push(`${location} exceeds 4,000 characters.`);
    } else if (component.type === 11) {
      if (!validMediaUrl(component.media?.url)) errors.push(`${location} needs a valid HTTPS or attachment URL.`);
      if (String(component.media?.url || '').length > 2048) errors.push(`${location} URL exceeds 2,048 characters.`);
      if (String(component.description || '').length > 1024) errors.push(`${location} description exceeds 1,024 characters.`);
    } else if (component.type === 9) {
      const children = Array.isArray(component.components) ? component.components : [];
      if (children.length < 1 || children.length > 3) errors.push(`${location} needs 1 to 3 text blocks.`);
      if (children.some((child) => child?.type !== 10)) errors.push(`${location} can contain only Text Display blocks.`);
      if (![2, 11].includes(component.accessory?.type)) errors.push(`${location} needs a button or thumbnail accessory.`);
      children.forEach((child, index) => visit(child, `${location}, text ${index + 1}`, 'sectionText'));
      if (component.accessory?.type === 2 || component.accessory?.type === 11) visit(component.accessory, `${location} accessory`, 'sectionAccessory');
    } else if (component.type === 17) {
      const children = Array.isArray(component.components) ? component.components : [];
      if (!children.length || children.length > 10) errors.push(`${location} needs 1 to 10 child blocks.`);
      children.forEach((child, index) => {
        if (![1, 9, 10, 12, 13, 14].includes(child?.type)) errors.push(`${location}, block ${index + 1} is not supported inside a container.`);
        visit(child, `${location}, block ${index + 1}`, 'container');
      });
    } else if (component.type === 12) {
      const items = Array.isArray(component.items) ? component.items : [];
      if (items.length < 1 || items.length > 10) errors.push(`${location} needs 1 to 10 media items.`);
      items.forEach((item, index) => {
        const url = String(item?.media?.url || '');
        if (!validMediaUrl(url)) errors.push(`${location}, media ${index + 1} needs a valid HTTPS or attachment URL.`);
        if (url.length > 2048) errors.push(`${location}, media ${index + 1} URL exceeds 2,048 characters.`);
        if (String(item?.description || '').length > 1024) errors.push(`${location}, media ${index + 1} description exceeds 1,024 characters.`);
      });
    } else if (component.type === 13) {
      if (!/^attachment:\/\/[^\s?#]{1,100}$/i.test(String(component.file?.url || ''))) errors.push(`${location} needs an attachment:// file URL.`);
      if (String(component.file?.url || '').length > 2048) errors.push(`${location} URL exceeds 2,048 characters.`);
    } else if (component.type === 14) {
      if (![1, 2].includes(Number(component.spacing))) errors.push(`${location} spacing must be small or large.`);
      if (typeof component.divider !== 'boolean') errors.push(`${location} needs a valid divider setting.`);
    } else if (component.type === 1) {
      const children = Array.isArray(component.components) ? component.components : [];
      const select = children.some((child) => [3, 5, 6, 7, 8].includes(child?.type));
      if (!children.length || children.length > 5 || select && children.length !== 1) errors.push(`${location} must contain up to 5 buttons or one select menu.`);
      children.forEach((child, index) => {
        visit(child, `${location}, control ${index + 1}`, 'actionRow');
      });
    } else if (component.type === 2) {
      if (![1, 2, 3, 4, 5].includes(component.style)) errors.push(`${location} uses an unsupported button style.`);
      if (component.style === 5) {
        if (Object.hasOwn(component, 'custom_id')) errors.push(`${location} link buttons cannot have a custom ID.`);
        if (!/^https?:\/\//i.test(String(component.url || ''))) errors.push(`${location} link button needs an HTTP or HTTPS URL.`);
        if (String(component.url || '').length > 512) errors.push(`${location} link URL exceeds 512 characters.`);
      } else {
        if (Object.hasOwn(component, 'url')) errors.push(`${location} non-link buttons cannot have a URL.`);
        addId(component);
      }
      if (String(component.custom_id || '').length > 100) errors.push(`${location} custom ID exceeds 100 characters.`);
      if (String(component.label || '').length > 80) errors.push(`${location} button label exceeds 80 characters.`);
      if (!String(component.label || '').trim() && !component.emoji) errors.push(`${location} needs a label or emoji.`);
    } else if ([3, 5, 6, 7, 8].includes(component.type)) {
      addId(component);
      if (String(component.placeholder || '').length > 150) errors.push(`${location} placeholder exceeds 150 characters.`);
      if (!Number.isInteger(component.min_values) || !Number.isInteger(component.max_values) || component.min_values < 0 || component.max_values < 1 || component.min_values > component.max_values || component.max_values > 25) errors.push(`${location} has invalid selection limits.`);
      if (component.type === 3) {
        if (!Array.isArray(component.options) || component.options.length < 1 || component.options.length > 25) errors.push(`${location} needs 1 to 25 select options.`);
        const optionValues = new Set();
        for (const option of component.options || []) {
          if (!String(option.label || '').trim() || String(option.label || '').length > 100 || !String(option.value || '').trim() || String(option.value || '').length > 100) errors.push(`${location} options need labels and values up to 100 characters.`);
          if (String(option.description || '').length > 100) errors.push(`${location} option descriptions exceed 100 characters.`);
          if (optionValues.has(option.value)) errors.push(`${location} option values must be unique.`);
          optionValues.add(option.value);
        }
        if (component.max_values > (component.options || []).length) errors.push(`${location} max selections exceed its option count.`);
      }
      if (component.type === 8 && Object.hasOwn(component, 'channel_types')
        && (!Array.isArray(component.channel_types) || component.channel_types.some((channelType) => !Number.isInteger(channelType)))) {
        errors.push(`${location} channel types must be an array of integers when provided.`);
      }
    } else if (![1, 9, 10, 11, 12, 13, 14, 17].includes(component.type)) errors.push(`${location} uses an unsupported component type.`);
  };
  root.forEach((component, index) => visit(component, `Block ${index + 1}`));
  if (count > 40) errors.push('A Components V2 message can contain at most 40 components, including nested components.');
  if (textLength > 4000) errors.push('Text Display content across the message exceeds 4,000 characters.');
  return [...new Set(errors)];
}

export function buildDiscordModal(config, renderText = (value) => value) {
  const modal = config && typeof config === 'object' ? config : {};
  const customId = String(renderText(String(modal.customId || ''))).trim();
  const title = String(renderText(String(modal.title || ''))).trim();
  const fields = Array.isArray(modal.components) ? modal.components : [];
  if (!customId || customId.length > 100) throw new Error('Popup Modal needs a custom ID from 1 to 100 characters.');
  if (!title || title.length > 45) throw new Error('Popup Modal title must be from 1 to 45 characters.');
  if (fields.length < 1 || fields.length > 5) throw new Error('Popup Modal must have 1–5 fields.');
  const ids = new Set();
  const optionsFor = (field, max) => {
    const options = Array.isArray(field.options) ? field.options : [];
    if (options.length < 1 || options.length > max) throw new Error(`${field.type === 'string_select' ? 'String select' : 'Checkbox or radio group'} needs 1–${max} options.`);
    const values = new Set();
    return options.map((option) => {
      const label = String(renderText(String(option.label || ''))).trim();
      const value = String(renderText(String(option.value || ''))).trim();
      if (!label || label.length > 100 || !value || value.length > 100 || values.has(value)) throw new Error('Modal option labels and values must be unique, non-empty, and at most 100 characters.');
      values.add(value);
      return { label, value, ...(option.description ? { description: String(renderText(String(option.description))).slice(0, 100) } : {}) };
    });
  };
  const components = fields.map((field) => {
    const fieldId = String(renderText(String(field.customId || ''))).trim();
    const label = String(renderText(String(field.label || ''))).trim();
    const description = field.description ? String(renderText(String(field.description))).trim() : '';
    if (!fieldId || fieldId.length > 100 || ids.has(fieldId)) throw new Error('Each modal field needs a unique custom ID from 1 to 100 characters.');
    ids.add(fieldId);
    if (!label || label.length > 45) throw new Error('Modal field labels must be from 1 to 45 characters.');
    if (description.length > 100) throw new Error('Modal field descriptions can be at most 100 characters.');
    const type = field.type || 'text';
    let component;
    if (type === 'text') {
      const maxLength = Number(field.maxLength ?? 4000);
      const minLength = Number(field.minLength ?? 0);
      if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 4000 || !Number.isInteger(minLength) || minLength < 0 || minLength > maxLength) throw new Error('Text input length must be between 0 and 4,000 characters.');
      component = { type: 4, custom_id: fieldId, style: Number(field.style) === 2 ? 2 : 1, min_length: minLength, max_length: maxLength, required: field.required !== false,
        ...(field.placeholder ? { placeholder: String(renderText(String(field.placeholder))).slice(0, 100) } : {}),
        ...(field.value != null && field.value !== '' ? { value: String(renderText(String(field.value))).slice(0, maxLength) } : {}) };
    } else if (type === 'string_select') {
      const options = optionsFor(field, 25);
      const maxValues = Math.max(1, Math.min(options.length, Number(field.maxValues) || 1));
      const requestedMin = Number(field.minValues ?? (field.required === false ? 0 : 1)) || 0;
      component = { type: 3, custom_id: fieldId, options, min_values: Math.min(maxValues, field.required === false ? Math.max(0, requestedMin) : Math.max(1, requestedMin)), max_values: maxValues, required: field.required !== false,
        ...(field.placeholder ? { placeholder: String(renderText(String(field.placeholder))).slice(0, 150) } : {}) };
    } else if (['user_select', 'role_select', 'mentionable_select', 'channel_select'].includes(type)) {
      const componentType = { user_select: 5, role_select: 6, mentionable_select: 7, channel_select: 8 }[type];
      const maxValues = Math.max(1, Math.min(25, Number(field.maxValues) || 1));
      const requestedMin = Number(field.minValues ?? (field.required === false ? 0 : 1)) || 0;
      component = { type: componentType, custom_id: fieldId, min_values: Math.min(maxValues, field.required === false ? Math.max(0, requestedMin) : Math.max(1, requestedMin)), max_values: maxValues, required: field.required !== false,
        ...(field.placeholder ? { placeholder: String(renderText(String(field.placeholder))).slice(0, 150) } : {}),
        ...(type === 'channel_select' && Array.isArray(field.channelTypes) ? { channel_types: field.channelTypes.map(Number).filter(Number.isInteger) } : {}) };
    } else if (type === 'checkbox') {
      component = { type: 23, custom_id: fieldId, ...(field.defaultChecked ? { default: true } : {}) };
    } else if (type === 'file_upload') {
      const maxValues = Math.max(1, Math.min(10, Number(field.maxValues) || 1));
      const requestedFileTypes = Array.isArray(field.fileTypes) ? [...new Set(field.fileTypes.map((item) => String(item).trim().toLowerCase()).filter(Boolean))] : [];
      if (requestedFileTypes.length > 10 || requestedFileTypes.some((item) => !/^(image|video|audio|\.[a-z0-9]{1,16})$/.test(item))) throw new Error('File type filters must be image, video, audio, or a file extension such as .pdf (up to 10).');
      const fileTypes = requestedFileTypes;
      const requestedMin = Number(field.minValues ?? (field.required === false ? 0 : 1)) || 0;
      component = { type: 19, custom_id: fieldId, min_values: Math.min(maxValues, field.required === false ? Math.max(0, requestedMin) : Math.max(1, requestedMin)), max_values: maxValues, required: field.required !== false, ...(fileTypes.length ? { file_types: fileTypes } : {}) };
    } else if (type === 'checkbox_group' || type === 'radio_group') {
      const options = optionsFor(field, 10);
      if (type === 'radio_group' && options.length < 2) throw new Error('Radio groups need at least two options.');
      const maxValues = Math.max(1, Math.min(options.length, Number(field.maxValues) || options.length));
      component = { type: type === 'checkbox_group' ? 22 : 21, custom_id: fieldId, options, required: field.required !== false,
        ...(type === 'checkbox_group' ? { min_values: Math.min(maxValues, field.required === false ? Math.max(0, Number(field.minValues) || 0) : Math.max(1, Number(field.minValues) || 0)), max_values: maxValues } : {}) };
    } else throw new Error(`Unsupported modal field type: ${type}`);
    return { type: 18, label, ...(description ? { description } : {}), component };
  });
  return { custom_id: customId, title, components };
}

export function validateDiscordModalPayload(modal) {
  const errors = [];
  const customId = String(modal?.custom_id || '').trim();
  const title = String(modal?.title || '').trim();
  const components = Array.isArray(modal?.components) ? modal.components : [];
  if (!customId || customId.length > 100) errors.push('Popup Modal custom ID must be 1 to 100 characters.');
  if (!title || title.length > 45) errors.push('Popup Modal title must be 1 to 45 characters.');
  if (components.length < 1 || components.length > 5) errors.push('A Components V2 modal must contain 1 to 5 top level components.');
  const ids = new Set();
  for (const [index, item] of components.entries()) {
    if (item?.type === 10) {
      if (!String(item.content || '').trim() || String(item.content || '').length > 4000) errors.push(`Modal text ${index + 1} must contain 1 to 4,000 characters.`);
      continue;
    }
    const label = String(item?.label || '').trim();
    const description = String(item?.description || '');
    const input = item?.component;
    const fieldId = String(input?.custom_id || '').trim();
    if (item?.type !== 18 || !input || ![3, 4, 5, 6, 7, 8, 19, 21, 22, 23].includes(input.type)) errors.push(`Modal component ${index + 1} must be a Label or Text Display.`);
    if (!label || label.length > 45) errors.push(`Modal component ${index + 1} label must be 1 to 45 characters.`);
    if (description.length > 100) errors.push(`Modal component ${index + 1} description exceeds 100 characters.`);
    if (!fieldId || fieldId.length > 100 || ids.has(fieldId)) errors.push(`Modal component ${index + 1} needs a unique custom ID from 1 to 100 characters.`);
    ids.add(fieldId);
    if (input?.type === 4) {
      const min = Number(input.min_length ?? 0);
      const max = Number(input.max_length ?? 4000);
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max > 4000 || min > max) errors.push(`Modal text input ${index + 1} has invalid character limits.`);
      if (String(input.value || '').length > max || String(input.placeholder || '').length > 100) errors.push(`Modal text input ${index + 1} value or placeholder is too long.`);
    }
    if ([3, 21, 22].includes(input?.type)) {
      const options = Array.isArray(input.options) ? input.options : [];
      const minimum = input.type === 21 ? 2 : 1;
      const maximum = input.type === 3 ? 25 : 10;
      if (options.length < minimum || options.length > maximum) errors.push(`Modal choice group ${index + 1} must have ${minimum} to ${maximum} options.`);
      const values = new Set();
      for (const option of options) {
        const value = String(option.value || '');
        if (!String(option.label || '').trim() || String(option.label || '').length > 100 || !value.trim() || value.length > 100 || String(option.description || '').length > 100 || values.has(value)) errors.push('Modal option labels, values, and descriptions must be valid, unique, and at most 100 characters.');
        values.add(value);
      }
    }
    if ([3, 5, 6, 7, 8].includes(input?.type)) {
      const minimum = Number(input.min_values ?? 0);
      const maximum = Number(input.max_values ?? 1);
      if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < 1 || maximum > (input.type === 3 ? 25 : 25) || minimum > maximum) errors.push(`Modal select ${index + 1} has invalid selection limits.`);
      if (String(input.placeholder || '').length > 150) errors.push(`Modal select ${index + 1} placeholder exceeds 150 characters.`);
      if (input.type === 3 && maximum > (input.options || []).length) errors.push(`Modal select ${index + 1} maximum selections exceed its option count.`);
    }
    if (input?.type === 19) {
      const minimum = Number(input.min_values ?? 1);
      const maximum = Number(input.max_values ?? 1);
      if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < 1 || maximum > 10 || minimum > maximum) errors.push(`Modal file upload ${index + 1} supports 0 to 10 files.`);
    }
  }
  return [...new Set(errors)];
}

