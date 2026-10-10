export const PRODUCT_NAME = "OpenRelay";
export const CLI_NAME = "orl";
export const CLI_ALIASES = [CLI_NAME, "opencodex", "ocx"] as const;
export const LOG_PREFIX = "[openrelay]";
export const CLI_HEADING = `${PRODUCT_NAME} (${CLI_NAME})`;
export const CLI_COMPATIBILITY = "Legacy CLI aliases: opencodex and ocx remain supported.";

export function startupBanner(port: number): string {
  return `${LOG_PREFIX} ${PRODUCT_NAME} proxy running on http://localhost:${port}`;
}
