import { failed, filterKind, record, terminalCommand, type FilterKind } from "./eligibility";

export type RtkProtocol = "responses" | "native-responses" | "chat" | "messages";
export interface Candidate {
  id: string;
  kind: FilterKind;
  text: string;
  replace(text: string): void;
}
export interface ProtocolDraft { candidates: Candidate[]; finish(): unknown }

/** Shallow copies only the containers on a changed result's path. No content is mutated. */
export function protocolDraft(body: unknown, protocol: RtkProtocol, checkpoint: () => void): ProtocolDraft {
  const root = record(body);
  const responses = protocol === "responses" || protocol === "native-responses";
  const source = root?.[responses ? "input" : "messages"];
  if (!root || !Array.isArray(source)) return { candidates: [], finish: () => body };
  if (source.length > 4096) throw new Error("structure_limit");
  const calls = new Map<string, { name: unknown; args: unknown; position: number; local: boolean }>();
  const duplicate = new Set<string>();
  const results: Array<{ id: string; row: Record<string, unknown>; position: number; set(row: unknown): void }> = [];
  const output = source.slice();
  let changed = false;
  const call = (id: unknown, name: unknown, args: unknown, position: number, local = false) => {
    if (typeof id !== "string" || !id || id.length > 1024) return;
    if (calls.has(id)) duplicate.add(id);
    else calls.set(id, { name, args, position, local });
  };
  const result = (id: unknown, row: Record<string, unknown>, position: number, set: (row: unknown) => void) => {
    if (typeof id !== "string" || !id || id.length > 1024) return;
    if (results.some(value => value.id === id)) duplicate.add(id);
    results.push({ id, row, position, set });
    if (results.length > 32) throw new Error("result_limit");
  };
  source.forEach((value, position) => {
    checkpoint();
    const row = record(value);
    if (!row) return;
    const set = (next: unknown) => { output[position] = next; changed = true; };
    if (responses) {
      if (row.type === "function_call") call(row.call_id, row.namespace == null || row.namespace === "functions" ? row.name : undefined, row.arguments, position);
      if (row.type === "local_shell_call") {
        const action = record(row.action);
        const command = action?.command;
        // Only a direct argv invocation; no shell -c/-Command wrappers.
        if ((protocol !== "native-responses" || action?.type === "exec") && Array.isArray(command) && command.length > 0 && command.every(arg => typeof arg === "string" && /^[\w./:=@-]+$/.test(arg))) {
          call(row.call_id ?? row.id, "shell", { command: command.join(" ") }, position, true);
        }
      }
      if (row.type === "function_call_output") result(row.call_id, row, position, set);
      if (protocol === "native-responses" && row.type === "local_shell_call_output") result(row.call_id, row, position, set);
    } else if (protocol === "chat") {
      if (row.role === "assistant" && Array.isArray(row.tool_calls)) {
        if (row.tool_calls.length > 256) throw new Error("structure_limit");
        for (const value of row.tool_calls) {
          const tool = record(value), fn = record(tool?.function);
          if (tool?.type === "function") call(tool.id, fn?.name, fn?.arguments, position);
        }
      }
      if (row.role === "tool") result(row.tool_call_id, row, position, set);
    } else if (Array.isArray(row.content)) {
      if (row.content.length > 256) throw new Error("structure_limit");
      const content = row.content.slice();
      row.content.forEach((value, index) => {
        const block = record(value);
        if (!block) return;
        if (row.role === "assistant" && block.type === "tool_use") call(block.id, block.name, block.input, position);
        if (row.role === "user" && block.type === "tool_result") result(block.tool_use_id, block, position, next => {
          content[index] = next; set({ ...row, content });
        });
      });
    }
  });
  const candidates: Candidate[] = [];
  for (const result of results) {
    checkpoint();
    const tool = calls.get(result.id);
    if (!tool || tool.position >= result.position || duplicate.has(result.id) || failed(result.row)) continue;
    if (result.row.type === "local_shell_call_output" && !tool.local) continue;
    const command = terminalCommand(tool.name, tool.args);
    const kind = command ? filterKind(command) : undefined;
    if (!kind) continue;
    const key = responses ? "output" : "content";
    const payload = result.row[key];
    // Mixed text/media and opaque JSON result envelopes are deliberately excluded in v1.
    if (typeof payload === "string") {
      candidates.push({ id: result.id, kind, text: payload, replace: text => result.set({ ...result.row, [key]: text }) });
    } else if (Array.isArray(payload) && payload.length === 1) {
      const part = record(payload[0]);
      if (part && (part.type === "text" || part.type === "input_text") && typeof part.text === "string") {
        candidates.push({ id: result.id, kind, text: part.text, replace: text => result.set({ ...result.row, [key]: [{ ...part, text }] }) });
      }
    }
  }
  return { candidates, finish: () => changed ? { ...root, [responses ? "input" : "messages"]: output } : body };
}
