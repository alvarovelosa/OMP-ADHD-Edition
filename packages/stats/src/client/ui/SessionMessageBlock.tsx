import type React from "react";
import { useState } from "react";
import { JsonBlock } from "./JsonBlock";

export interface SessionMessageBlockProps {
	entryIndex: number;
	message: unknown;
	hideTools: boolean;
}

export type SessionMessageRole = "user" | "assistant" | "developer" | "toolResult" | "unknown";

export interface ParsedToolCall {
	id: string;
	name: string;
	input: unknown;
}

export interface ParsedToolResult {
	toolCallId: string;
	toolName: string;
	text: string;
	isError: boolean;
}

export interface ParsedSessionMessage {
	role: SessionMessageRole;
	/** Recognized as one of the session-entry message shapes; false falls back to raw JSON. */
	recognized: boolean;
	/** Prose text extracted from `text` content blocks (assistant) or string/text-block content (user/developer). */
	text: string;
	toolCalls: ParsedToolCall[];
	toolResult: ParsedToolResult | null;
}

const ROLE_LABELS: Record<SessionMessageRole, string> = {
	user: "User",
	assistant: "Assistant",
	developer: "Developer",
	toolResult: "Tool",
	unknown: "Unknown",
};

/**
 * Parses a raw session JSONL `message` field into a display-friendly shape.
 *
 * Session messages follow pi-ai's `Message` union: `role: "user" | "developer"`
 * carries `content: string | (TextContent | ImageContent)[]`; `role: "assistant"`
 * carries `content` blocks of `type: "text" | "thinking" | "toolCall" | ...`;
 * `role: "toolResult"` is a standalone entry with `toolCallId`/`toolName`/`content`/`isError`.
 */
export function parseSessionMessage(message: unknown): ParsedSessionMessage {
	const empty: ParsedSessionMessage = {
		role: "unknown",
		recognized: false,
		text: "",
		toolCalls: [],
		toolResult: null,
	};
	if (message === null || typeof message !== "object") return empty;
	const msg = message as Record<string, unknown>;

	if (msg.role === "user" || msg.role === "developer") {
		return {
			role: msg.role,
			recognized: true,
			text: extractContentText(msg.content),
			toolCalls: [],
			toolResult: null,
		};
	}

	if (msg.role === "assistant") {
		const blocks = Array.isArray(msg.content) ? msg.content : [];
		const textParts: string[] = [];
		const toolCalls: ParsedToolCall[] = [];
		for (const block of blocks) {
			if (block === null || typeof block !== "object") continue;
			const b = block as Record<string, unknown>;
			if (b.type === "text" && typeof b.text === "string") {
				textParts.push(b.text);
			} else if (b.type === "toolCall") {
				toolCalls.push({
					id: typeof b.id === "string" ? b.id : "",
					name: typeof b.name === "string" ? b.name : "unknown",
					input: b.arguments,
				});
			}
		}
		return { role: "assistant", recognized: true, text: textParts.join("\n\n"), toolCalls, toolResult: null };
	}

	if (msg.role === "toolResult") {
		return {
			role: "toolResult",
			recognized: true,
			text: "",
			toolCalls: [],
			toolResult: {
				toolCallId: typeof msg.toolCallId === "string" ? msg.toolCallId : "",
				toolName: typeof msg.toolName === "string" ? msg.toolName : "tool",
				text: extractContentText(msg.content),
				isError: msg.isError === true,
			},
		};
	}

	return empty;
}

function extractContentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const item of content) {
		if (item === null || typeof item !== "object") continue;
		const b = item as Record<string, unknown>;
		if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
		else if (b.type === "image") parts.push("[image]");
	}
	return parts.join("\n\n");
}

function stringifyToolInput(input: unknown): string {
	if (typeof input === "string") return input;
	try {
		return JSON.stringify(input, null, 2) ?? String(input);
	} catch {
		return String(input);
	}
}

/** Renders `text` as paragraphs with inline code, splitting out fenced ``` code blocks as code cards. */
function renderProse(text: string, keyPrefix: string): React.ReactNode[] {
	const nodes: React.ReactNode[] = [];
	const pushParagraphs = (segment: string, tag: string) => {
		const paragraphs = segment.split(/\n{2,}/);
		for (let i = 0; i < paragraphs.length; i++) {
			const el = renderParagraph(paragraphs[i], `${tag}-p${i}`);
			if (el !== null) nodes.push(el);
		}
	};
	const fenceRe = /```(?:\w*)\n?([\s\S]*?)```/g;
	let lastIndex = 0;
	let blockIndex = 0;
	let match: RegExpExecArray | null = fenceRe.exec(text);
	while (match !== null) {
		if (match.index > lastIndex) {
			pushParagraphs(text.slice(lastIndex, match.index), `${keyPrefix}-t${blockIndex}`);
		}
		const code = match[1].replace(/\n$/, "");
		nodes.push(
			<pre className="stats-message-code" key={`${keyPrefix}-c${blockIndex}`}>
				<code>{code}</code>
			</pre>,
		);
		lastIndex = fenceRe.lastIndex;
		blockIndex++;
		match = fenceRe.exec(text);
	}
	if (lastIndex < text.length) {
		pushParagraphs(text.slice(lastIndex), `${keyPrefix}-t${blockIndex}`);
	}
	return nodes;
}

function renderParagraph(paragraph: string, key: string): React.ReactElement | null {
	if (paragraph.trim().length === 0) return null;
	const inlineRe = /`([^`\n]+)`/g;
	const segments: React.ReactNode[] = [];
	let lastIndex = 0;
	let i = 0;
	let match: RegExpExecArray | null = inlineRe.exec(paragraph);
	while (match !== null) {
		if (match.index > lastIndex) segments.push(paragraph.slice(lastIndex, match.index));
		segments.push(
			<code className="stats-message-inline-code" key={`${key}-i${i}`}>
				{match[1]}
			</code>,
		);
		lastIndex = inlineRe.lastIndex;
		i++;
		match = inlineRe.exec(paragraph);
	}
	if (lastIndex < paragraph.length) segments.push(paragraph.slice(lastIndex));
	return (
		<p className="stats-message-text" key={key}>
			{segments}
		</p>
	);
}

function ToolCallCard({ call }: { call: ParsedToolCall }) {
	const [expanded, setExpanded] = useState(false);
	return (
		<div className="stats-message-tool-card">
			<button
				type="button"
				className="stats-message-tool-card-header"
				onClick={() => setExpanded(v => !v)}
				aria-expanded={expanded}
			>
				<span>🔧 tool: {call.name}</span>
				<span className="stats-message-tool-card-toggle">{expanded ? "▼" : "▶"}</span>
			</button>
			{expanded && (
				<pre className="stats-message-code">
					<code>{stringifyToolInput(call.input)}</code>
				</pre>
			)}
		</div>
	);
}

function ToolResultCard({ result }: { result: ParsedToolResult }) {
	const [expanded, setExpanded] = useState(false);
	return (
		<div className="stats-message-tool-card" data-error={result.isError}>
			<button
				type="button"
				className="stats-message-tool-card-header"
				onClick={() => setExpanded(v => !v)}
				aria-expanded={expanded}
			>
				<span>
					{result.isError ? "⚠️" : "✅"} result: {result.toolName}
				</span>
				<span className="stats-message-tool-card-toggle">{expanded ? "▼" : "▶"}</span>
			</button>
			{expanded && (
				<pre className="stats-message-code">
					<code>{result.text.length > 0 ? result.text : "(empty)"}</code>
				</pre>
			)}
		</div>
	);
}

export function SessionMessageBlock({ entryIndex, message, hideTools }: SessionMessageBlockProps) {
	const [showJson, setShowJson] = useState(false);
	const parsed = parseSessionMessage(message);

	if (!parsed.recognized) {
		return <JsonBlock data={message} title={`#${entryIndex} message`} initialCollapsed />;
	}

	const visibleToolCalls = hideTools ? [] : parsed.toolCalls;
	const visibleToolResult = hideTools ? null : parsed.toolResult;
	const hasText = parsed.text.trim().length > 0;
	const isEmpty = !hasText && visibleToolCalls.length === 0 && visibleToolResult === null;

	return (
		<div className="stats-message-block">
			<div className="stats-message-header">
				<span className="stats-message-role-badge" data-role={parsed.role}>
					{ROLE_LABELS[parsed.role]}
				</span>
				<span className="stats-message-index">#{entryIndex}</span>
				<button type="button" className="stats-message-json-toggle" onClick={() => setShowJson(v => !v)}>
					{showJson ? "Hide JSON" : "Inspect JSON"}
				</button>
			</div>
			<div className="stats-message-body">
				{hasText && renderProse(parsed.text, `m${entryIndex}`)}
				{visibleToolCalls.map(call => (
					<ToolCallCard call={call} key={call.id || call.name} />
				))}
				{visibleToolResult && <ToolResultCard result={visibleToolResult} />}
				{isEmpty && <p className="stats-message-text stats-message-empty">No renderable content.</p>}
			</div>
			{showJson && (
				<div className="stats-message-json-wrapper">
					<JsonBlock data={message} title={`#${entryIndex} raw JSON`} />
				</div>
			)}
		</div>
	);
}
