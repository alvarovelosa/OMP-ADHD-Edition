import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { gzipSync } from "node:zlib";
import { listArchivedSessions } from "@oh-my-pi/pi-coding-agent/session/session-listing";
import { getAgentDir, getSessionsDir } from "@oh-my-pi/pi-utils";

describe("listArchivedSessions", () => {
	it("discovers and parses gzip-compressed archived session files", async () => {
		const agentDir = getAgentDir();
		const archiveSessionsDir = path.join(
			path.dirname(getSessionsDir(agentDir)),
			"archive",
			"sessions",
			"test-project",
		);

		fs.mkdirSync(archiveSessionsDir, { recursive: true });

		const sessionId = "archived-test-session-123456";
		const jsonlContent = [
			JSON.stringify({
				type: "session",
				version: 1,
				id: sessionId,
				timestamp: "2026-07-25T10:00:00.000Z",
				cwd: "/test/project",
				title: "Archived Session Title",
			}),
			JSON.stringify({
				type: "message",
				message: {
					role: "user",
					content: "Hello from archived session",
				},
			}),
		].join("\n");

		const compressed = gzipSync(Buffer.from(jsonlContent, "utf-8"));
		const archiveFilePath = path.join(archiveSessionsDir, `${sessionId}.jsonl.gz`);
		fs.writeFileSync(archiveFilePath, compressed);

		try {
			const sessions = await listArchivedSessions();
			const found = sessions.find(s => s.id === sessionId);

			expect(found).toBeDefined();
			expect(found?.archived).toBe(true);
			expect(found?.title).toBe("Archived Session Title");
			expect(found?.firstMessage).toBe("Hello from archived session");
		} finally {
			try {
				fs.rmSync(archiveFilePath, { force: true });
			} catch {}
		}
	});
});
