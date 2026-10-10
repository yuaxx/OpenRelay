/** Existing model-management commands; use the exact ID from `live`, including native IDs. */
export function modelSelectionNextSteps(provider: string, afterLogin = false) {
  const name = provider === "codex" || provider === "chatgpt" ? "openai" : provider;
  return {
    provider: name,
    afterLogin,
    requiresRunningProxy: true,
    commands: {
      list: `orl models live --provider ${name}`,
      enable: 'orl models enable "<model-id-from-list>"',
      disable: 'orl models disable "<model-id-from-list>"',
      enableNative: 'orl models enable "<model-id-from-list>" --native',
      disableNative: 'orl models disable "<model-id-from-list>" --native',
      enableAll: `orl models provider ${name} on`,
      disableAll: `orl models provider ${name} off`,
    },
  };
}

export function modelSelectionGuidance(provider: string, afterLogin = false): string[] {
  const next = modelSelectionNextSteps(provider, afterLogin);
  return [
    afterLogin ? "After login completes, manage model switches with:" : "Manage model switches (the provider stays active):",
    "  Start the proxy first if needed: orl start",
    "  Replace <model-id-from-list> with an exact ID printed by the list command.",
    "  For rows marked native, use the --native variants (including IDs containing /).",
    ...Object.values(next.commands).map(command => `  ${command}`),
    "  If initial discovery is still pending, check the provider connection and retry: orl sync",
  ];
}
