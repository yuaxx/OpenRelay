export type FilterKind = "git-status" | "test" | "build";
type Row = Record<string, unknown>;
export function record(value: unknown): Row | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : undefined;
}

/** Deliberately excludes exec/code-mode and write_stdin, even in a shell namespace. */
const TERMINAL_NAMES = new Set(["exec_command", "shell_command", "Bash", "bash", "shell", "run_command"]);
export function terminalCommand(name: unknown, args: unknown): string | undefined {
  if (typeof name !== "string" || !TERMINAL_NAMES.has(name)) return;
  if (typeof args === "string") {
    if (args.length > 16_384) return;
    try { args = JSON.parse(args); } catch { return; }
  }
  const input = record(args);
  if (!input) return;
  if (Object.hasOwn(input, "cmd") && Object.hasOwn(input, "command")) return;
  const command = name === "exec_command" ? input.cmd : input.command;
  if (typeof command !== "string" || command.length > 4096) return;
  // No shell evaluation, substitutions, redirection, compound commands or quoted wrappers.
  if (/[;&|<>`$\r\n\\"'(){}]/.test(command)) return;
  return command.trim();
}

export function filterKind(command: string): FilterKind | undefined {
  if (/^git status(?:\s+(?:--short|-s|--branch|-b|--porcelain(?:=v1)?))*$/.test(command)) return "git-status";
  if (/^(?:bun test|(?:vitest|jest|pytest)(?: run)?)(?:\s+[\w./:=@-]+)*$/.test(command)) return "test";
  if (/^(?:vite build|tsc(?: --noEmit)?|(?:bun|npm|pnpm) run (?:build|typecheck)|yarn build)(?:\s+[\w./:=@-]+)*$/.test(command)) return "build";
}

export function failed(row: Row): boolean {
  return row.is_error === true || row.isError === true
    || [row.exit_code, row.exitCode].some(value => value !== undefined && value !== 0)
    || row.status === "failed" || row.status === "incomplete";
}
