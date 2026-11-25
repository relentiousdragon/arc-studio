import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const activeDesktopPromptLabels = new Set();
//
export function isDesktopPromptActive(label) {
  return typeof label === 'string' && activeDesktopPromptLabels.has(label);
}

function currentPromptThemeChoice() {
  try {
    const saved = localStorage.getItem('arc_theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return 'system';
}

function currentPromptTheme() {
  const choice = currentPromptThemeChoice();
  if (choice !== 'system') return choice;
  return globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export async function closeDesktopPrompts() {
  if (!window.__ARC_STUDIO_CONFIG__?.desktop) return;
  activeDesktopPromptLabels.clear();
  await invoke('close_desktop_prompts');
}

export async function showDesktopPrompt(prompt) {
  const requestId = globalThis.crypto?.randomUUID?.();
  if (!requestId) throw new Error('This device could not create a secure prompt identifier.');
  const promptLabel = `arc-prompt-${requestId}`;

  let unlisten;
  let resolveResponse;
  const response = new Promise((resolve) => { resolveResponse = resolve; });
  unlisten = await listen('arc:desktop-prompt-response', (event) => {
    if (event.payload?.requestId !== requestId) return;
    resolveResponse(event.payload.response ?? null);
  });
  activeDesktopPromptLabels.add(promptLabel);

  try {
    await invoke('open_desktop_prompt', { requestId, payload: {
      ...prompt,
      themeChoice: prompt.themeChoice || currentPromptThemeChoice(),
      theme: prompt.theme || currentPromptTheme(),
      releaseChannel: prompt.releaseChannel || window.__ARC_STUDIO_CONFIG__?.releaseChannel || 'stable'
    } });
    return await response;
  } finally {
    activeDesktopPromptLabels.delete(promptLabel);
    unlisten?.();
  }
}
