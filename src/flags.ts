// The two on/off switches in the popup, kept in chrome.storage.sync so they follow the user across devices.

export interface Flags {
  /** Show the CamelCamelCamel / Keepa buttons on product pages. */
  showEmbeddedButtons: boolean;
  /** Show the multi-page toolbar on search results. */
  showSearchToolbar: boolean;
}

export type FlagName = keyof Flags;

const DEFAULTS: Flags = { showEmbeddedButtons: true, showSearchToolbar: true };

export async function getFlag(name: FlagName): Promise<boolean> {
  try {
    const stored = await chrome.storage.sync.get({ [name]: DEFAULTS[name] });
    return stored[name] !== false;
  } catch {
    return DEFAULTS[name]; // storage unavailable: fall back to the default
  }
}

export async function setFlag(name: FlagName, value: boolean): Promise<void> {
  await chrome.storage.sync.set({ [name]: value });
}

/** Calls `listener` whenever the flag changes (from the popup or another tab). Returns an unsubscribe function. */
export function onFlagChange(name: FlagName, listener: (value: boolean) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    const change = changes[name];
    if (area === "sync" && change) listener(change.newValue !== false);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
