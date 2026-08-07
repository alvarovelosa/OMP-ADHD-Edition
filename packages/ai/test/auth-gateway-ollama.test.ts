import { expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { startAuthGateway } from "@oh-my-pi/pi-ai/auth-gateway";
import { AuthStorage } from "@oh-my-pi/pi-ai/auth-storage";
import { createMockModel, registerMockApi } from "@oh-my-pi/pi-ai/providers/mock";
import type { SimpleStreamOptions } from "@oh-my-pi/pi-ai/types";
import { Effort } from "@oh-my-pi/pi-catalog/effort";

test("auth-gateway Ollama endpoints: GET /api/tags and POST /api/chat", async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-ollama-test-"));
	const storage = await AuthStorage.create(path.join(dir, "auth.db"));
	const mockModel = createMockModel({ provider: "anthropic", id: "claude-3-5-sonnet-20241022" });
	const handle = startAuthGateway({
		bind: "127.0.0.1:0",
		bearerTokens: [],
		storage,
		resolveModel: () => mockModel,
		listModels: () => [mockModel],
		version: "test",
	});

	try {
		// 1. GET /api/tags
		const tagsRes = await fetch(`${handle.url}/api/tags`);
		expect(tagsRes.status).toBe(200);
		const tagsData = (await tagsRes.json()) as { models: Array<{ name: string; model: string }> };
		expect(tagsData.models).toHaveLength(1);
		expect(tagsData.models[0]?.name).toBe("anthropic/claude-3-5-sonnet-20241022");

		// 2. POST /api/chat missing model -> 400 with string error
		const errRes = await fetch(`${handle.url}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(errRes.status).toBe(400);
		const errData = (await errRes.json()) as { error: string };
		expect(errData.error).toContain("Missing top-level `model` field");
	} finally {
		await handle.close();
		storage.close();
		await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
	}
});

test("auth-gateway Gemini models enforce reasoning enabled", async () => {
	registerMockApi();
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-gemini-test-"));
	const storage = await AuthStorage.create(path.join(dir, "auth.db"));
	await storage.setRuntimeApiKey("google", "test-key");

	const optsContainer: { opts?: SimpleStreamOptions } = {};
	const geminiModel = createMockModel({
		provider: "google",
		id: "gemini-2.5-flash",
		handler: (_ctx, opts) => {
			optsContainer.opts = opts;
			return { content: ["gemini reply"] };
		},
	});

	const handle = startAuthGateway({
		bind: "127.0.0.1:0",
		bearerTokens: [],
		storage,
		resolveModel: () => geminiModel,
		listModels: () => [geminiModel],
		version: "test",
	});

	try {
		const res = await fetch(`${handle.url}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "google/gemini-2.5-flash",
				messages: [{ role: "user", content: "hello" }],
			}),
		});
		expect(res.status).toBe(200);
		expect(optsContainer.opts).toBeDefined();
		expect(optsContainer.opts?.reasoning).toBe(Effort.High);
		expect(optsContainer.opts?.disableReasoning).toBe(false);
	} finally {
		await handle.close();
		storage.close();
		await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
	}
});
