import { describe, expect, it } from "bun:test";
import { getSessionUsageMap } from "@oh-my-pi/omp-stats/aggregator";
import { getSessionUsageBySessionFile, initDb, insertMessageStats } from "@oh-my-pi/omp-stats/db";
import type { MessageStats } from "@oh-my-pi/omp-stats/types";

describe("session-usage", () => {
	it("aggregates requestCount, totalTokens, and totalCost grouped by session_file", async () => {
		await initDb();

		const session1 = "C:\\Users\\test\\.omp\\agent\\sessions\\proj\\session-1.jsonl";
		const session2 = "C:\\Users\\test\\.omp\\agent\\sessions\\proj\\session-2.jsonl";

		const msg1: MessageStats = {
			entryId: "msg-1",
			sessionFile: session1,
			folder: "proj",
			model: "gpt-4o",
			provider: "openai",
			api: "openai-completions",
			timestamp: Date.now(),
			duration: 1000,
			ttft: 100,
			stopReason: "stop",
			errorMessage: null,
			agentType: "main",
			usage: {
				input: 100,
				output: 50,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 150,
				cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
			},
		};

		const msg2: MessageStats = {
			...msg1,
			entryId: "msg-2",
			sessionFile: session1,
			usage: {
				input: 200,
				output: 100,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 300,
				cost: { input: 0.002, output: 0.004, cacheRead: 0, cacheWrite: 0, total: 0.006 },
			},
		};

		const msg3: MessageStats = {
			...msg1,
			entryId: "msg-3",
			sessionFile: session2,
			usage: {
				input: 500,
				output: 500,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 1000,
				cost: { input: 0.01, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.02 },
			},
		};
		insertMessageStats([msg1, msg2, msg3]);

		const directMap = getSessionUsageBySessionFile();
		expect(directMap[session1]).toBeDefined();
		expect(directMap[session1].requestCount).toBe(2);
		expect(directMap[session1].totalTokens).toBe(450);
		expect(directMap[session1].totalCost).toBeCloseTo(0.009, 5);

		expect(directMap[session2]).toBeDefined();
		expect(directMap[session2].requestCount).toBe(1);
		expect(directMap[session2].totalTokens).toBe(1000);
		expect(directMap[session2].totalCost).toBeCloseTo(0.02, 5);

		const aggregatorMap = await getSessionUsageMap();
		expect(aggregatorMap[session1]).toEqual(directMap[session1]);
		expect(aggregatorMap[session2]).toEqual(directMap[session2]);
	});
});
