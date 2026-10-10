# Terminal Result Compression

The optional `rtk.enabled` configuration field defaults off. Invalid configuration cannot enable it. The Dashboard switch reads the existing `/api/settings` snapshot and writes authenticated `/api/rtk`; only OpenRelay configuration is persisted, without client synchronization. No additional polling is started. The module never executes a command, reads project files, calls a model or writes result content to disk.

## Ownership

The `src/compression/rtk/` module separates explicit terminal eligibility, protocol traversal, built-in filters, bounded transactional compression and aggregate counters. Its transport helper prepares outbound copies at adapter/native HTTP builders after destination selection. Chat and Messages bridges register original-source evidence in a request-keyed WeakMap; internal Responses representations cannot widen eligibility when that evidence is absent.

Responses function_call_output, Chat tool messages and Messages tool_result blocks require one preceding recognized terminal call and unique call/result ids. Local shell argv supports only direct recognized invocations, never shell wrappers. Unknown tools, write_stdin, custom outputs, ambiguous commands, shell composition and mixed-media outputs are excluded. A single text block retains all its other fields.

Any cache_control marker protects the entire request, including its cached prefix. User text, tool arguments, source files, images, reasoning, opaque state, call identifiers, exit codes and item ordering are not rewritten. Results with failure metadata, diagnostic warnings (including inline and DeprecationWarning), failure signals or nonzero exit-code text remain byte-identical. Git help removal matches complete known two-space instruction lines and never tab-indented file entries; success noise removal requires a complete recognized line without trailing diagnostics. Unknown output formats and transformations without a positive byte saving are no-ops.

## Transport and replay

HTTP Responses builders receive a copy with matching shortened raw outputs and normalized toolResult messages. The raw and parsed representations must each contain exactly one identical source string for that id. The original body and context remain available to routing, admission, retry policy and replay stores. Compression does not reparse history or modify model/account selection.

Chat native and managed Messages native builders prepare their copy once before initial build and reuse it on credential rebuild. Caller-forward Messages compresses only the messages inference endpoint, never count_tokens. Responses adapter wrappers share an exchange-local memo of filtering and raw/normalized projections across rebuilt adapters; same-target retries reuse the built serialized request. Rebuilds reuse prepared arrays and preserve current model/options without repeating qualification or counting. Changed model/options are still read from the current parsed request.

Native Responses WebSocket ingress and first-party upstream WebSocket requests use the same immutable raw/normalized builder projection as HTTP. Replayed local_shell_call with function_call_output therefore reaches passthrough and translated adapters, including Antigravity. Compaction, runTurn and internal decision calls bypass RTK. A bridge child without its original-source registration also bypasses it. Provider-hosted tool results invisible to the proxy cannot be compressed. Antigravity keeps the Google adapter's existing functionResponse identity, adjacency and thought-signature authority.

The connection-local native helper prepares response.inject and retained-socket response.create copies immediately before native WebSocket serialization, using completed tool calls as evidence. The channel validates and journals original results. Exact matching result echoes and rejected-injection inputs are restored in copied upstream events before channel validation, replay observation and downstream delivery. Repeated preparation of one frame reuses its copy and counters. String local_shell_call_output requires local_shell_call action.type exec and direct supported argv. Observation is bounded to 32 calls / 256 KiB and echo evidence to 32 shortened results / 2 MiB per retained connection; exhaustion stops further compression on that connection. Evidence is memory-only and discarded with the connection owner. The transparent live/realtime sideband relay and local-shell result shapes absent from the normalized parser remain excluded from translated next-turn requests.

## Bounds and fallback

Eligible results must be at least 2 KiB and at most 256 KiB UTF-8; a request admits at most 1 MiB of candidate text and 32 result rows. Additional limits are 10,000 lines per result, 16,384 characters per line, bounded structural traversal and one 10 ms monotonic processing budget spanning qualification, filtering, matching, copying, buffer admission and initial transport projection. Checkpoints provide cooperative deadline enforcement; synchronous JavaScript operations are not preempted. Working-buffer admission is capped at 8 MiB using a conservative reservation; this is a buffer-accounting bound rather than a separate JavaScript heap sandbox.

The compressor commits only after every candidate and final deadline check succeeds. Exceptions, memory refusal, invalid shapes and exceeded limits return the original body and no replacements, including when earlier candidates were tentatively transformed. The translator budget reserves working buffers and retains shortened strings until its normal request disposal. A failed optional allocation does not refuse inference.

Counters retain only request/result counts, byte totals, fallbacks and elapsed time in memory. Exceptions, deadline exhaustion, transient/retained buffer refusal and abort retain elapsed time and count one fallback; failed preparations are memoized too. Transport counts apply only to accepted replacements and are memoized for repeated builds. The dashboard DTO contains only checked, compressed, skipped, fallback, bytesBefore, bytesAfter, elapsedMs and fixed aggregate reason codes. Counts describe prepared requests since process start and reset on restart; byte reduction is not provider usage or cost. No text, command, path, call id, account identity, token estimate or cost estimate is retained in counters.

## Evidence

`tests/responses/rtk-compression.test.ts` covers three protocol shapes, pairing/duplicates, diagnostic preservation, Unicode/ANSI/CRLF, limits, rollback, protected content and actual byte accounting. `tests/responses/rtk-transport.test.ts` covers source provenance, original/replay immutability, prepared retry reuse, disabled identity, memory refusal, configuration defaults and synthetic Antigravity functionResponse serialization without inference.

Native regressions cover control-wire preparation, original journal restoration, terminal output counters and native-to-Google translation without inference.

Filtering rules are adapted from the MIT-licensed OmniRoute RTK reference at 048d9e2f; the module's notice preserves the upstream license. `scripts/build-standalone.ts` copies it unchanged to `RTK-NOTICE.md` beside the executable. The loader, TOML support, code stripper, raw-output persistence and runtime dependencies are not imported.
