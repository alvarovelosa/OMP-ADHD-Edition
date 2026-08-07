/**
 * ArkType schemas for the Ollama `/api/chat` request shape we accept on the
 * auth-gateway. Permissive on anything without a downstream effect — unknown
 * fields are silently ignored rather than rejected (same philosophy as
 * `openai-chat-server-schema.ts`).
 */

import { type } from "@oh-my-pi/omptype";

export const toolCallSchema = type({
	function: {
		name: "string",
		"description?": "string",
		"arguments?": "object",
	},
});

export const toolDefSchema = type({
	type: "'function'",
	function: {
		name: "string",
		"description?": "string",
		"parameters?": "object",
	},
});

export const messageSchema = type({
	role: "'system' | 'user' | 'assistant' | 'tool'",
	"content?": "string",
	"images?": "string[]",
	"tool_calls?": toolCallSchema.array(),
});

export const optionsSchema = type({
	"temperature?": "number",
	"top_k?": "number",
	"top_p?": "number",
	"min_p?": "number",
	"stop?": type("string").or("string[]"),
	"num_predict?": "number",
	"+": "delete",
});

export const thinkSchema = type("boolean").or("'high' | 'medium' | 'low' | 'max'");

export const ollamaChatRequestSchema = type({
	model: "string >= 1",
	messages: messageSchema.array(),
	"tools?": toolDefSchema.array(),
	"format?": "unknown",
	"options?": optionsSchema,
	"stream?": "boolean",
	"think?": thinkSchema,
	"keep_alive?": "unknown",
	"logprobs?": "unknown",
	"top_logprobs?": "unknown",
});

export type OllamaChatMessage = typeof messageSchema.infer;
export type OllamaToolCall = typeof toolCallSchema.infer;
export type OllamaToolDef = typeof toolDefSchema.infer;
