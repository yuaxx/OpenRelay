import type { FilterKind } from "./eligibility";

// Adapted from OmniRoute RTK git-status, test-* and build-* rules (048d9e2f).
// Unlike upstream renderers, never truncate file lists or replace a build with "ok".
export function filterOutput(text: string, kind: FilterKind): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(eol);
  const clean = lines.map(line => line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, ""));
  if (clean.some(line => line.length > 16_384)) return text;
  const evidence = clean.join("\n");
  // Full failure/warning output is the safest first-version preservation policy.
  if (/\b(?:[\w]*warnings?|warn|[\w]*error|fatal|traceback|FAILED|failure|panic|exception|uncaught|aborted|cancelled|canceled|killed|SIGTERM|SIGKILL)\b|timed out|^\s*FAIL\b|\(fail\)|⚠|✗|✖/im.test(evidence)
    || /(?:[1-9]\d*\s+(?:fail(?:ed|ures)?|errors?)\b|(?:exit(?:ed)?(?: with)?(?: code)?|exit_code|exitCode)\s*[:=]?\s*(?:[1-9]\d*|-\d+))/i.test(evidence)) return text;
  let drop: (line: string) => boolean;
  if (kind === "git-status") {
    const valid = clean.every(line => !line.trim() || /^On branch |^Your branch |^Changes |^Untracked files:|^no changes added|^nothing (?:added|to commit)|^\s*\(use |^\t.+|^ [MADRCU?! ][MADRCU?! ]?\s|^[MADRCU?! ][MADRCU?! ]\s|^## /.test(line));
    if (!valid || !clean.some(line => /^On branch |^## |^[ MADRCU?!]{2}\s/.test(line))) return text;
    drop = line => /^  \(use "git (?:add <file>\.\.\." to (?:update what will be committed|include in what will be committed)|restore <file>\.\.\." to discard changes in working directory|restore --staged <file>\.\.\." to unstage)\)$/.test(line);
  } else if (kind === "test") {
    if (!/(?:\b\d+ pass\b|\b\d+ passed\b|Tests\s+\d+ passed|Tests:\s*\d+ passed)/.test(evidence)) return text;
    // Keep counts, durations, skip/todo rows, diagnostics and unknown lines.
    drop = line => /^\s*(?:\(pass\) [^\r\n\[\]]+ \[\d+(?:\.\d+)?\s*ms\]|✓ [^\r\n()]+ \(\d+(?:\.\d+)?\s*ms\)|PASS\s+\S+|\.+\s*\[\s*\d+%\s*\])\s*$/.test(line);
  } else {
    if (!/(?:built in \d|Build succeeded|Found 0 errors|TSFILE:)/i.test(evidence)) return text;
    drop = line => /^\s*(?:transforming(?:\.\.\.)?|rendering chunks(?:\.\.\.)?|computing gzip size(?:\.\.\.)?|✓ \d+ modules transformed\.?)\s*$/.test(line);
  }
  return lines.filter((_, index) => !drop(clean[index])).join(eol);
}
