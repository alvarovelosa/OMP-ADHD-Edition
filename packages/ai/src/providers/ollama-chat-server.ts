import { type } from "@oh-my-pi/omptype";
import type { Effort } from "@oh-my-pi/pi-catalog/effort";
import type { AuthGatewayStreamControl, AuthGatewayParsedRequest as ParsedRequest } from "../auth-gateway/types";
import * as AIError from "../error";
import type {
	AssistantMessage,
	AssistantMessageEventStream,
	Context,
	ImageContent,
	Message,
	StopReason,
	TextContent,
	Tool,
	ToolCall,
	ToolResultMessage,
	TSchema,
} from "../types";
import {
	type OllamaChatMessage,
	type OllamaToolCall,
	type OllamaToolDef,
	ollamaChatRequestSchema,
} from "./ollama-chat-server-schema";

export type { ParsedRequest };

// ---------------------------------------------------------------------------
// Image mime sniffing
// ---------------------------------------------------------------------------

/**
 * Sniff an image's mime type from its base64-decoded magic bytes. Ollama's
 * wire images carry no data-URI prefix (unlike OpenAI's `image_url`), so the
 * content-type has to be recovered from the bytes themselves. Defaults to
 * `image/png` when unrecognized — same fallback used by clipboard image
 * capture (`utils/clipboard.ts`).
 */
function sniffImageMimeType(base64: string): string {
	let bytes: Buffer;
	try {
		bytes = Buffer.from(base64, "base64");
	} catch {
		return "image/png";
	}
	if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
		return "image/png";
	}
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "image/jpeg";
	}
	if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
		return "image/gif";
	}
	if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
		return "image/webp";
	}
	return "image/png";
}

// ---------------------------------------------------------------------------
// parseRequest
// ---------------------------------------------------------------------------

function normalizeStop(value: string | string[] | undefined): string[] | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string") return [value];
	return value.length > 0 ? value : undefined;
}

function buildTools(tools: OllamaToolDef[]): Tool[] | undefined {
	if (tools.length === 0) return undefined;
	const out: Tool[] = [];
	for (const t of tools) {
		out.push({
			name: t.function.name,
			description: t.function.description ?? "",
			parameters: (t.function.parameters ?? {}) as Record<string, unknown> as TSchema,
		});
	}
	return out;
}

export function parseRequest(body: unknown, _headers?: Headers): ParsedRequest {
	const parsed = ollamaChatRequestSchema(body);
	if (parsed instanceof type.errors) {
		throw new AIError.ValidationError(`ollama-chat: ${parsed.summary}`);
	}
	const data = parsed;

	const now = Date.now();
	const systemParts: string[] = [];
	const messages: Message[] = [];
	// Ollama's wire `ToolCall` (outbound on assistant turns) and tool-result
	// message (inbound `role: "tool"`) carry no id linking them together —
	// unlike OpenAI's `tool_call_id`. We synthesize positional ids per
	// assistant turn and correlate subsequent tool-result messages against
	// them in order; the cursor resets on every assistant message so a fresh
	// tool-call turn doesn't inherit stale correlation state.
	let pendingToolCalls: { id: string; name: string }[] = [];
	let toolCallCursor = 0;

	for (const m of data.messages as OllamaChatMessage[]) {
		switch (m.role) {
			case "system": {
				const text = m.content ?? "";
				if (text.length > 0) systemParts.push(text);
				break;
			}
			case "user": {
				const text = m.content ?? "";
				const parts: (TextContent | ImageContent)[] = [];
				if (text.length > 0) parts.push({ type: "text", text });
				if (m.images) {
					for (const image of m.images) {
						parts.push({ type: "image", data: image, mimeType: sniffImageMimeType(image) });
					}
				}
				messages.push({ role: "user", content: parts.length > 0 ? parts : "", timestamp: now });
				break;
			}
			case "assistant": {
				const rawCalls: OllamaToolCall[] = m.tool_calls ?? [];
				const toolCalls: ToolCall[] = rawCalls.map((raw, i) => ({
					type: "toolCall" as const,
					id: `call_${i}`,
					name: raw.function.name,
					arguments: (raw.function.arguments ?? {}) as Record<string, unknown>,
				}));
				pendingToolCalls = toolCalls.map(tc => ({ id: tc.id, name: tc.name }));
				toolCallCursor = 0;

				const content: AssistantMessage["content"] = [];
				const text = m.content ?? "";
				if (text.length > 0) content.push({ type: "text", text });
				content.push(...toolCalls);

				const assistantMessage: AssistantMessage = {
					role: "assistant",
					content,
					api: "ollama-chat",
					provider: "ollama",
					model: data.model,
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: toolCalls.length > 0 ? "toolUse" : "stop",
					timestamp: now,
				};
				messages.push(assistantMessage);
				break;
			}
			case "tool": {
				const next = toolCallCursor < pendingToolCalls.length ? pendingToolCalls[toolCallCursor] : undefined;
				const toolCallId = next?.id ?? `call_${toolCallCursor}`;
				const toolName = next?.name ?? "unknown";
				toolCallCursor++;
				const toolResult: ToolResultMessage = {
					role: "toolResult",
					toolCallId,
					toolName,
					content: [{ type: "text", text: m.content ?? "" }],
					isError: false,
					timestamp: now,
				};
				messages.push(toolResult);
				break;
			}
		}
	}

	const tools = data.tools ? buildTools(data.tools) : undefined;

	const context: Context = {
		messages,
		...(systemParts.length > 0 ? { systemPrompt: [systemParts.join("\n\n")] } : {}),
		...(tools ? { tools } : {}),
	};

	const options: ParsedRequest["options"] = {};
	const opt = data.options;
	if (opt) {
		if (opt.temperature !== undefined) options.temperature = opt.temperature;
		if (opt.top_k !== undefined) options.topK = opt.top_k;
		if (opt.top_p !== undefined) options.topP = opt.top_p;
		if (opt.min_p !== undefined) options.minP = opt.min_p;
		const stopSequences = normalizeStop(opt.stop);
		if (stopSequences) options.stopSequences = stopSequences;
		if (opt.num_predict !== undefined) options.maxOutputTokens = opt.num_predict;
	}
	if (data.format !== undefined) options.responseFormat = data.format;
	if (data.think === false) {
		options.disableReasoning = true;
	} else if (typeof data.think === "string") {
		options.reasoning = data.think as Effort;
	}

	return {
		modelId: data.model,
		context,
		// Ollama defaults to streaming (opposite of OpenAI's default-false).
		stream: data.stream !== false,
		options,
	};
}

// ---------------------------------------------------------------------------
// encodeResponse (non-streaming)
// ---------------------------------------------------------------------------

function flattenAssistant(message: AssistantMessage): {
	text: string;
	reasoning: string;
	toolCalls: ToolCall[];
} {
	let text = "";
	let reasoning = "";
	const toolCalls: ToolCall[] = [];
	for (const part of message.content) {
		switch (part.type) {
			case "text":
				text += part.text;
				break;
			case "thinking":
				reasoning += part.thinking;
				break;
			case "redactedThinking":
				reasoning += part.data;
				break;
			case "toolCall":
				toolCalls.push(part);
				break;
		}
	}
	return { text, reasoning, toolCalls };
}

/**
 * Ollama's wire vocabulary has no tool-call-specific or error-specific
 * `done_reason`; `handleFormatEndpoint` already routes
 * `stopReason === "error" | "aborted"` through `formatError` before
 * `encodeResponse`/the streaming `done` chunk ever observe them, so this only
 * needs to distinguish `"length"` from everything else.
 */
export function mapDoneReason(reason: StopReason): string {
	return reason === "length" ? "length" : "stop";
}

export function encodeResponse(message: AssistantMessage, requestedModelId: string): Record<string, unknown> {
	const { text, reasoning, toolCalls } = flattenAssistant(message);

	const responseMessage: Record<string, unknown> = {
		role: "assistant",
		// Ollama's `message.content` is always a string, never `null`.
		content: text.length > 0 ? text : "",
	};
	if (reasoning.length > 0) responseMessage.thinking = reasoning;
	if (toolCalls.length > 0) {
		responseMessage.tool_calls = toolCalls.map(tc => ({ function: { name: tc.name, arguments: tc.arguments } }));
	}

	return {
		model: requestedModelId,
		created_at: new Date().toISOString(),
		message: responseMessage,
		done: true,
		done_reason: mapDoneReason(message.stopReason),
		// This bridge proxies to remote OAuth-backed providers, so "model load
		// time" and per-token wall-clock timing have no local meaning the way
		// they would for a real Ollama daemon; reporting 0 is honest, not a stub.
		total_duration: 0,
		load_duration: 0,
		prompt_eval_count: message.usage.input + message.usage.cacheRead + message.usage.cacheWrite,
		prompt_eval_duration: 0,
		eval_count: message.usage.output,
		eval_duration: 0,
	};
}

// ---------------------------------------------------------------------------
// encodeStream (NDJSON)
// ---------------------------------------------------------------------------

export const streamContentType = "application/x-ndjson";

export function encodeStream(
	events: AssistantMessageEventStream,
	requestedModelId: string,
	_options?: ParsedRequest["options"],
	control?: AuthGatewayStreamControl,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	let cancelled = control?.signal?.aborted === true;
	const markCancelled = () => {
		cancelled = true;
	};
	control?.signal?.addEventListener("abort", markCancelled, { once: true });

	const writeLine = (controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown): void => {
		if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
	};

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			// contentIndex (from pi-ai events) -> buffered tool-call name/args.
			// Ollama's wire ToolCall has no incremental-argument concept — unlike
			// pi-ai's toolcall_start/toolcall_delta/toolcall_end triplet — so
			// arguments are buffered and emitted whole on toolcall_end.
			const toolBuffers = new Map<number, { name: string; argsBuf: string }>();

			try {
				if (cancelled) {
					controller.close();
					return;
				}

				for await (const event of events) {
					if (cancelled) return;
					switch (event.type) {
						case "text_delta":
							if (event.delta.length > 0) {
								writeLine(controller, {
									model: requestedModelId,
									created_at: new Date().toISOString(),
									message: { role: "assistant", content: event.delta },
									done: false,
								});
							}
							break;

						case "thinking_delta":
							if (event.delta.length > 0) {
								writeLine(controller, {
									model: requestedModelId,
									created_at: new Date().toISOString(),
									message: { role: "assistant", thinking: event.delta },
									done: false,
								});
							}
							break;

						case "toolcall_start": {
							const partial = event.partial.content[event.contentIndex];
							const call = partial && partial.type === "toolCall" ? partial : undefined;
							toolBuffers.set(event.contentIndex, { name: call?.name ?? "", argsBuf: "" });
							break;
						}

						case "toolcall_delta": {
							const entry = toolBuffers.get(event.contentIndex);
							if (entry) entry.argsBuf += event.delta;
							break;
						}

						case "toolcall_end": {
							const entry = toolBuffers.get(event.contentIndex);
							if (!entry) break;
							let args: Record<string, unknown> = {};
							if (entry.argsBuf.length > 0) {
								try {
									const v: unknown = JSON.parse(entry.argsBuf);
									args =
										v && typeof v === "object" && !Array.isArray(v)
											? (v as Record<string, unknown>)
											: { __raw: entry.argsBuf };
								} catch {
									args = { __raw: entry.argsBuf };
								}
							}
							writeLine(controller, {
								model: requestedModelId,
								created_at: new Date().toISOString(),
								message: {
									role: "assistant",
									tool_calls: [{ function: { name: event.toolCall.name || entry.name, arguments: args } }],
								},
								done: false,
							});
							break;
						}

						case "done":
							writeLine(controller, {
								model: requestedModelId,
								created_at: new Date().toISOString(),
								message: { role: "assistant", content: "" },
								done: true,
								done_reason: mapDoneReason(event.reason),
								total_duration: 0,
								load_duration: 0,
								prompt_eval_count:
									event.message.usage.input + event.message.usage.cacheRead + event.message.usage.cacheWrite,
								prompt_eval_duration: 0,
								eval_count: event.message.usage.output,
								eval_duration: 0,
							});
							controller.close();
							return;

						case "error": {
							const msg = event.error.errorMessage ?? "stream error";
							writeLine(controller, { error: msg });
							controller.close();
							return;
						}

						// Drop start / *_start and text/thinking *_end — the NDJSON wire
						// only surfaces deltas and the terminal `done` chunk.
						default:
							break;
					}
				}

				// Stream ended without a terminal `done` (defensive). Close gracefully.
				if (!cancelled) {
					writeLine(controller, {
						model: requestedModelId,
						created_at: new Date().toISOString(),
						message: { role: "assistant", content: "" },
						done: true,
						done_reason: "stop",
						total_duration: 0,
						load_duration: 0,
						prompt_eval_count: 0,
						prompt_eval_duration: 0,
						eval_count: 0,
						eval_duration: 0,
					});
					controller.close();
				}
			} catch (err) {
				if (!cancelled) {
					const msg = err instanceof Error ? err.message : String(err);
					writeLine(controller, { error: msg });
					controller.close();
				}
			} finally {
				control?.signal?.removeEventListener("abort", markCancelled);
			}
		},
		cancel(reason) {
			cancelled = true;
			control?.signal?.removeEventListener("abort", markCancelled);
			control?.onCancel?.(reason);
		},
	});
}

// ---------------------------------------------------------------------------
// formatError
// ---------------------------------------------------------------------------

/** Ollama's flat error envelope: `{ error: message }` — no `type` field. */
export function formatError(status: number, _type: string, message: string): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}
