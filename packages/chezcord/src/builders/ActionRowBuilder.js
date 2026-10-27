import { ComponentTypes, ButtonStyles } from '../constants.js';
//
export function parseEmoji(emoji) {
  if (!emoji) return undefined;
  if (typeof emoji === 'object') {
    if (emoji.id !== undefined || emoji.name !== undefined) {
      const name = emoji.name || '';
      const id = emoji.id ? String(emoji.id) : '';
      if (!id) return name ? { name } : undefined;
      return { id, name, ...(emoji.animated ? { animated: true } : {}) };
    }
    return undefined;
  }
  const str = String(emoji).trim();
  if (!str) return undefined;
  const match = /^<(a?):([a-zA-Z0-9_~]+):([0-9]+)>$/.exec(str);
  if (match) {
    return {
      name: match[2],
      id: match[3],
      ...(match[1] === 'a' ? { animated: true } : {})
    };
  }
  const unbracketed = /^(?:(a):)?([a-zA-Z0-9_~]+):([0-9]+)$/.exec(str);
  if (unbracketed) {
    return {
      name: unbracketed[2],
      id: unbracketed[3],
      ...(unbracketed[1] === 'a' ? { animated: true } : {})
    };
  }
  return { name: str };
}

export class ButtonBuilder {
  constructor(data = {}) {
    this.data = {
      type: ComponentTypes.BUTTON,
      style: data.style ?? ButtonStyles.PRIMARY,
      label: data.label ?? undefined,
      custom_id: data.custom_id ?? undefined,
      url: data.url ?? undefined,
      disabled: data.disabled ?? false,
      emoji: data.emoji ? parseEmoji(data.emoji) : undefined
    };
  }

  setCustomId(id) {
    this.data.custom_id = String(id).slice(0, 100);
    return this;
  }

  setLabel(label) {
    this.data.label = String(label).slice(0, 80);
    return this;
  }

  setStyle(style) {
    this.data.style = style;
    return this;
  }

  setURL(url) {
    this.data.url = url;
    this.data.style = ButtonStyles.LINK;
    return this;
  }

  setDisabled(disabled = true) {
    this.data.disabled = Boolean(disabled);
    return this;
  }

  setEmoji(emoji) {
    this.data.emoji = parseEmoji(emoji);
    return this;
  }

  toJSON() {
    return { ...this.data };
  }
}

export class SelectOptionBuilder {
  constructor(data = {}) {
    this.data = {
      label: String(data.label ?? '').slice(0, 100),
      value: String(data.value ?? '').slice(0, 100),
      ...(data.description ? { description: String(data.description).slice(0, 100) } : {}),
      ...(data.emoji ? { emoji: parseEmoji(data.emoji) } : {}),
      ...(data.default !== undefined ? { default: Boolean(data.default) } : {})
    };
  }

  setLabel(label) { this.data.label = String(label).slice(0, 100); return this; }
  setValue(value) { this.data.value = String(value).slice(0, 100); return this; }
  setDescription(description) { this.data.description = String(description).slice(0, 100); return this; }
  setEmoji(emoji) { this.data.emoji = parseEmoji(emoji); return this; }
  setDefault(value = true) { this.data.default = Boolean(value); return this; }
  toJSON() { return { ...this.data }; }
}

export class StringSelectMenuBuilder {
  constructor(data = {}) {
    this.data = {
      type: ComponentTypes.STRING_SELECT,
      custom_id: data.custom_id ?? undefined,
      placeholder: data.placeholder ?? undefined,
      min_values: data.min_values ?? 1,
      max_values: data.max_values ?? 1,
      options: (data.options || []).map((option) => option instanceof SelectOptionBuilder ? option : new SelectOptionBuilder(option))
    };
  }

  setCustomId(id) { this.data.custom_id = String(id).slice(0, 100); return this; }
  setPlaceholder(value) { this.data.placeholder = String(value).slice(0, 150); return this; }
  setMinValues(value) { this.data.min_values = Math.max(0, Math.min(25, Number(value) || 0)); return this; }
  setMaxValues(value) { this.data.max_values = Math.max(1, Math.min(25, Number(value) || 1)); return this; }
  addOptions(...options) { this.data.options.push(...options.flat().map((option) => option instanceof SelectOptionBuilder ? option : new SelectOptionBuilder(option))); return this; }
  toJSON() { return { ...this.data, options: this.data.options.map((option) => option.toJSON()) }; }
}

class EntitySelectMenuBuilder {
  constructor(type, data = {}) {
    this.data = {
      type,
      custom_id: data.custom_id ?? undefined,
      placeholder: data.placeholder ?? undefined,
      min_values: data.min_values ?? 1,
      max_values: data.max_values ?? 1,
      ...(type === ComponentTypes.CHANNEL_SELECT && data.channel_types ? { channel_types: [...data.channel_types] } : {})
    };
  }
  setCustomId(id) { this.data.custom_id = String(id).slice(0, 100); return this; }
  setPlaceholder(value) { this.data.placeholder = String(value).slice(0, 150); return this; }
  setMinValues(value) { this.data.min_values = Math.max(0, Math.min(25, Number(value) || 0)); return this; }
  setMaxValues(value) { this.data.max_values = Math.max(1, Math.min(25, Number(value) || 1)); return this; }
  toJSON() { return { ...this.data, ...(this.data.channel_types ? { channel_types: [...this.data.channel_types] } : {}) }; }
}

export class UserSelectMenuBuilder extends EntitySelectMenuBuilder {
  constructor(data = {}) { super(ComponentTypes.USER_SELECT, data); }
}
export class RoleSelectMenuBuilder extends EntitySelectMenuBuilder {
  constructor(data = {}) { super(ComponentTypes.ROLE_SELECT, data); }
}
export class MentionableSelectMenuBuilder extends EntitySelectMenuBuilder {
  constructor(data = {}) { super(ComponentTypes.MENTIONABLE_SELECT, data); }
}
export class ChannelSelectMenuBuilder extends EntitySelectMenuBuilder {
  constructor(data = {}) { super(ComponentTypes.CHANNEL_SELECT, data); }
  setChannelTypes(...types) { this.data.channel_types = types.flat(); return this; }
}

export class ActionRowBuilder {
  constructor(components = []) {
    this.components = [...components];
  }

  addComponents(...components) {
    this.components.push(...components.flat());
    return this;
  }

  toJSON() {
    const components = this.components.map((component) => (typeof component.toJSON === 'function' ? component.toJSON() : component));
    if (!components.length || components.length > 5) throw new RangeError('Discord action rows must contain 1 to 5 components.');
    if (components.some((component) => ![2, 3, 5, 6, 7, 8].includes(component?.type))) throw new TypeError('Discord action rows can contain buttons or select menus.');
    const selectCount = components.filter((component) => [3, 5, 6, 7, 8].includes(component?.type)).length;
    if (selectCount && components.length !== 1) throw new TypeError('A select menu must be the only component in its action row.');
    return {
      type: ComponentTypes.ACTION_ROW,
      components
    };
  }
}
