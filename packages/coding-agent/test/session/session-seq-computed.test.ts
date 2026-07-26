import { describe, expect, it } from "bun:test";
import { attachSessionSeqNumbers, type SessionInfo, sessionDisplayName } from "../../src/session/session-listing";

function makeSession(overrides: Partial<SessionInfo> & { id: string; created: Date; modified: Date }): SessionInfo {
	return {
		path: `/tmp/${overrides.id}.jsonl`,
		cwd: "/test",
		messageCount: 1,
		size: 100,
		firstMessage: "hello",
		allMessagesText: "hello",
		...overrides,
	};
}

describe("computed session sequence numbers (#N and #aN)", () => {
	it("attachSessionSeqNumbers sorts out-of-order sessions by created date oldest-first and assigns 1..N", () => {
		const base = Date.now();
		const sOldest = makeSession({
			id: "s-oldest",
			title: "Oldest",
			created: new Date(base - 10000),
			modified: new Date(base - 10000),
		});
		const sMiddle = makeSession({
			id: "s-middle",
			title: "Middle",
			created: new Date(base - 5000),
			modified: new Date(base - 5000),
		});
		const sNewest = makeSession({
			id: "s-newest",
			title: "Newest",
			created: new Date(base - 1000),
			modified: new Date(base - 1000),
		});

		// Pass out of order (newest, oldest, middle)
		const list = [sNewest, sOldest, sMiddle];
		attachSessionSeqNumbers(list);

		expect(sOldest.seq).toBe(1);
		expect(sMiddle.seq).toBe(2);
		expect(sNewest.seq).toBe(3);
	});

	it("prefixes live sessions with #1..#N oldest-first", () => {
		const now = Date.now();
		const live1 = makeSession({
			id: "session-1",
			title: "First Live",
			created: new Date(now - 2000),
			modified: new Date(now - 2000),
			seq: 1,
			archived: false,
		});
		const live2 = makeSession({
			id: "session-2",
			title: "Second Live",
			created: new Date(now - 1000),
			modified: new Date(now - 1000),
			seq: 2,
			archived: false,
		});

		expect(sessionDisplayName(live1)).toBe("#1 First Live");
		expect(sessionDisplayName(live2)).toBe("#2 Second Live");
	});

	it("prefixes archived sessions with #a1..#aN", () => {
		const now = Date.now();
		const archived1 = makeSession({
			id: "archived-1",
			title: "Old Archived",
			created: new Date(now - 5000),
			modified: new Date(now - 5000),
			seq: 1,
			archived: true,
		});
		const archived2 = makeSession({
			id: "archived-2",
			title: "Newer Archived",
			created: new Date(now - 3000),
			modified: new Date(now - 3000),
			seq: 2,
			archived: true,
		});

		expect(sessionDisplayName(archived1)).toBe("#a1 Old Archived");
		expect(sessionDisplayName(archived2)).toBe("#a2 Newer Archived");
	});

	it("handles untitled sessions with #N and #aN prefixes", () => {
		const now = new Date("2026-07-26T12:00:00Z");
		const liveUntitled = makeSession({
			id: "s-untitled",
			title: undefined,
			created: now,
			modified: now,
			seq: 1,
			archived: false,
		});
		const archivedUntitled = makeSession({
			id: "a-untitled",
			title: undefined,
			created: now,
			modified: now,
			seq: 1,
			archived: true,
		});

		expect(sessionDisplayName(liveUntitled)).toContain("#1 hello");
		expect(sessionDisplayName(archivedUntitled)).toContain("#a1 hello");
	});
});
