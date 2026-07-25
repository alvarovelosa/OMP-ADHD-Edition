import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AuthStorage } from "@oh-my-pi/pi-ai";
import { ModelRegistry } from "../model-registry";

/**
 * Stub AuthStorage that satisfies the surface used by ModelRegistry's
 * constructor (#loadModels → clearConfigApiKeys, constructor →
 * setFallbackResolver). The awaiter under test never reaches auth-gated code
 * paths, so no real credential store is required.
 */
function createStubAuthStorage(): AuthStorage {
	const stub = {
		setFallbackResolver: () => {},
		clearConfigApiKeys: () => {},
		hasAuth: () => false,
	};
	return stub as unknown as AuthStorage;
}

describe("ModelRegistry.awaitBackgroundRefresh", () => {
	let tmpDir: string;
	let registry: ModelRegistry;

	beforeEach(() => {
		tmpDir = mkdtempSync(path.join(os.tmpdir(), "omp-reg-"));
		// Construct with an explicit modelsPath inside the temp dir so the
		// constructor's #loadModels read returns "not-found" rather than
		// touching the host's ~/.omp/agent/models.yaml. isBunTestRuntime()
		// auto-stubs #fetch in the constructor.
		registry = new ModelRegistry(createStubAuthStorage(), path.join(tmpDir, "models.yaml"));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		rmSync(tmpDir, { recursive: true, force: true });
	});

	test("resolves immediately when no background refresh is in flight", async () => {
		// No refreshInBackground() called → #backgroundRefresh is undefined.
		// The awaiter must settle within a single microtask, never hanging.
		let settled = false;
		const p = registry.awaitBackgroundRefresh().then(() => {
			settled = true;
		});
		await Promise.resolve();
		await p;
		expect(settled).toBe(true);
	});

	test("blocks until the in-flight background refresh resolves, then resolves", async () => {
		// Drive refreshInBackground with a controlled refresh() return value so
		// #backgroundRefresh is captured but not yet settled.
		const { promise, resolve } = Promise.withResolvers<void>();
		const refreshSpy = vi.spyOn(registry, "refresh").mockReturnValue(promise);

		registry.refreshInBackground();
		expect(refreshSpy).toHaveBeenCalledTimes(1);

		let settled = false;
		const awaitPromise = registry.awaitBackgroundRefresh().then(() => {
			settled = true;
		});

		// Yield to the microtask queue: the awaiter must still be pending.
		for (let i = 0; i < 5; i++) await Promise.resolve();
		expect(settled).toBe(false);

		resolve();

		await awaitPromise;
		expect(settled).toBe(true);
	});

	test("resolves even when the underlying refresh rejects (refreshInBackground swallows)", async () => {
		// refreshInBackground wraps refresh() in .catch(...) so discovery errors
		// never reach awaitBackgroundRefresh callers. The awaiter must resolve,
		// not propagate the rejection.
		const { promise, reject } = Promise.withResolvers<void>();
		vi.spyOn(registry, "refresh").mockReturnValue(promise);

		registry.refreshInBackground();

		let settled = false;
		const awaitPromise = registry.awaitBackgroundRefresh().then(() => {
			settled = true;
		});

		reject(new Error("synthetic discovery failure"));

		await awaitPromise;
		expect(settled).toBe(true);
	});

	test("awaiter is a no-op after the in-flight refresh settles and clears #backgroundRefresh", async () => {
		// Once refreshInBackground's promise resolves, #backgroundRefresh is
		// cleared in the .finally. A subsequent awaitBackgroundRefresh must be
		// an immediate no-op (microtask), not hang waiting for a stale promise
		// or a second refresh that was never started.
		const { promise, resolve } = Promise.withResolvers<void>();
		vi.spyOn(registry, "refresh").mockReturnValue(promise);

		registry.refreshInBackground();
		resolve();
		await registry.awaitBackgroundRefresh();

		// Now #backgroundRefresh is cleared. A fresh await must resolve in a
		// single microtask — measure by asserting it settles before a second
		// microtask tick.
		let settled = false;
		const p = registry.awaitBackgroundRefresh().then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(true);
		await p;
	});

	test("refreshInBackground deduplicates: a second call while in-flight starts no new refresh", async () => {
		// The guard `if (this.#backgroundRefresh) return` at the top of
		// refreshInBackground prevents concurrent refreshes. A second call
		// while the first is still pending must not invoke refresh() again.
		const { promise, resolve } = Promise.withResolvers<void>();
		const refreshSpy = vi.spyOn(registry, "refresh").mockReturnValue(promise);

		registry.refreshInBackground();
		registry.refreshInBackground();
		registry.refreshInBackground();

		expect(refreshSpy).toHaveBeenCalledTimes(1);

		resolve();
		await registry.awaitBackgroundRefresh();

		// After settle, #backgroundRefresh is cleared — a new call DOES start
		// a fresh refresh.
		const { promise: secondPromise, resolve: secondResolve } = Promise.withResolvers<void>();
		refreshSpy.mockReturnValue(secondPromise);
		registry.refreshInBackground();
		expect(refreshSpy).toHaveBeenCalledTimes(2);

		secondResolve();
		await registry.awaitBackgroundRefresh();
import { describe, expect, it } from "bun:test";
import type { Model } from "@oh-my-pi/pi-ai";
import type { AuthStorage } from "../../session/auth-storage";
import { kNoAuth, ModelRegistry } from "../model-registry";

function createMockAuthStorage(keys: Record<string, string> = {}): AuthStorage {
	return {
		setFallbackResolver: () => {},
		clearConfigApiKeys: () => {},
		hasAuth: (provider: string) => provider in keys,
		getApiKey: async (provider: string) => keys[provider],
	} as unknown as AuthStorage;
}

describe("ModelRegistry", () => {
	describe("getApiKeyAndHeaders", () => {
		it("returns ok: true with apiKey and headers when API key exists", async () => {
			const authStorage = createMockAuthStorage({ openai: "test-openai-key" });
			const registry = new ModelRegistry(authStorage);
			const model: Model = {
				id: "gpt-4o",
				provider: "openai",
				name: "GPT-4o",
				headers: { "X-Custom-Header": "value" },
			} as unknown as Model;

			const result = await registry.getApiKeyAndHeaders(model);
			expect(result).toEqual({
				ok: true,
				apiKey: "test-openai-key",
				headers: { "X-Custom-Header": "value" },
			});
		});

		it("returns ok: false when no API key is available", async () => {
			const authStorage = createMockAuthStorage({});
			const registry = new ModelRegistry(authStorage);
			const model: Model = {
				id: "gpt-4o",
				provider: "openai",
				name: "GPT-4o",
			} as unknown as Model;

			const result = await registry.getApiKeyAndHeaders(model);
			expect(result).toEqual({ ok: false });
		});

		it("returns ok: true for keyless provider returning kNoAuth", async () => {
			const authStorage = createMockAuthStorage({});
			const registry = new ModelRegistry(authStorage);
			const model: Model = {
				id: "llama3",
				provider: "ollama",
				name: "Llama 3",
			} as unknown as Model;

			const result = await registry.getApiKeyAndHeaders(model);
			expect(result).toEqual({
				ok: true,
				apiKey: kNoAuth,
				headers: undefined,
			});
		});
	});
});
