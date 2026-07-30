import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as stats from "@oh-my-pi/omp-stats";
import { getAgentDir, getSessionsDir } from "@oh-my-pi/pi-utils";
import { handleDashboardApiRequest } from "../../src/config/dashboard-api";

describe("sessions-http-api", () => {
	let testSessionPath: string;
	let testSessionId: string;
	let sessionsDir: string;
	let testProjectDir: string;

	beforeEach(async () => {
		sessionsDir = getSessionsDir(getAgentDir());
		testProjectDir = path.join(sessionsDir, "test-project");
		await fs.mkdir(testProjectDir, { recursive: true });

		testSessionId = `test-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		testSessionPath = path.join(testProjectDir, `${testSessionId}.jsonl`);
		const sampleSessionLines = [
			JSON.stringify({ type: "title", title: "Test Session Title" }),
			JSON.stringify({ type: "session", id: testSessionId, timestamp: Date.now() }),
			JSON.stringify({
				type: "message",
				message: { role: "user", content: "Hello from test user" },
			}),
			JSON.stringify({
				type: "message",
				message: { role: "assistant", content: "Hello from test assistant" },
			}),
		].join("\n");

		await fs.writeFile(testSessionPath, sampleSessionLines, "utf-8");
	});

	afterEach(async () => {
		await fs.rm(testSessionPath, { force: true });
	});

	it("serves list, messages, archive, delete, and guards path traversal", async () => {
		const server = await stats.startServer(0, { apiHandler: handleDashboardApiRequest });
		const port = server.port;

		try {
			// GET /api/sessions/list
			const resList = await fetch(`http://localhost:${port}/api/sessions/list`);
			expect(resList.status).toBe(200);
			const list = (await resList.json()) as Array<{
				path: string;
				title: string;
				status: string;
				messageCount: number;
			}>;
			expect(Array.isArray(list)).toBe(true);

			const found = list.find(s => s.path === testSessionPath);
			expect(found).toBeDefined();
			expect(found?.title).toBe("#1 Test Session Title");
			expect(found?.messageCount).toBe(2);
			expect(found?.status).toBeDefined();

			// CORS check with matching origin
			const resListCors = await fetch(`http://localhost:${port}/api/sessions/list`, {
				headers: { Origin: `http://localhost:${port}`, Host: `localhost:${port}` },
			});
			expect(resListCors.headers.get("access-control-allow-origin")).toBe(`http://localhost:${port}`);

			// GET /api/sessions/messages?path=...&mode=recent&count=10
			const encodedPath = encodeURIComponent(testSessionPath);
			const resRecent = await fetch(
				`http://localhost:${port}/api/sessions/messages?path=${encodedPath}&mode=recent&count=10`,
			);
			expect(resRecent.status).toBe(200);
			const recentData = (await resRecent.json()) as {
				messages: Array<{ index: number; message: unknown }>;
				total: number;
				hasMore: boolean;
			};
			expect(recentData.total).toBe(2);
			expect(recentData.messages.length).toBe(2);
			expect(recentData.hasMore).toBe(false);

			// GET /api/sessions/messages?path=...&mode=full
			const resFull = await fetch(`http://localhost:${port}/api/sessions/messages?path=${encodedPath}&mode=full`);
			expect(resFull.status).toBe(200);
			const fullData = (await resFull.json()) as {
				messages: Array<{ index: number; message: unknown }>;
				total: number;
				hasMore: boolean;
			};
			expect(fullData.total).toBe(2);
			expect(fullData.messages.length).toBe(2);
			expect(fullData.hasMore).toBe(false);

			// Path traversal protection
			const resTraversal = await fetch(
				`http://localhost:${port}/api/sessions/messages?path=${encodeURIComponent("../../../etc/passwd")}&mode=full`,
			);
			expect(resTraversal.status).toBe(400);

			// POST /api/sessions/archive
			const archiveSessionId = `archive-test-${Date.now()}`;
			const archiveSessionPath = path.join(testProjectDir, `${archiveSessionId}.jsonl`);
			await fs.writeFile(
				archiveSessionPath,
				`${JSON.stringify({ type: "session", id: archiveSessionId, timestamp: Date.now() })}\n`,
				"utf-8",
			);

			const resArchive = await fetch(`http://localhost:${port}/api/sessions/archive`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: archiveSessionPath }),
			});
			expect(resArchive.status).toBe(200);
			const archiveResult = (await resArchive.json()) as { archivedTo: string };
			expect(archiveResult.archivedTo).toBeDefined();

			// Original file should be archived (no longer exists at old path)
			const existsAfterArchive = await fs.stat(archiveSessionPath).then(
				() => true,
				() => false,
			);
			expect(existsAfterArchive).toBe(false);

			// Check includeArchived parameter with "1" and "true"
			const resDefault = await fetch(`http://localhost:${port}/api/sessions/list`);
			const defaultList = (await resDefault.json()) as Array<{ path: string }>;
			expect(defaultList.some(s => s.path === archiveResult.archivedTo)).toBe(false);

			const resArchived1 = await fetch(`http://localhost:${port}/api/sessions/list?includeArchived=1`);
			const archivedList1 = (await resArchived1.json()) as Array<{ path: string; archived?: boolean }>;
			expect(archivedList1.some(s => s.path === archiveResult.archivedTo && s.archived === true)).toBe(true);

			const resArchivedTrue = await fetch(`http://localhost:${port}/api/sessions/list?includeArchived=true`);
			const archivedListTrue = (await resArchivedTrue.json()) as Array<{ path: string; archived?: boolean }>;
			expect(archivedListTrue.some(s => s.path === archiveResult.archivedTo && s.archived === true)).toBe(true);

			// POST /api/sessions/delete
			const deleteSessionId = `delete-test-${Date.now()}`;
			const deleteSessionPath = path.join(testProjectDir, `${deleteSessionId}.jsonl`);
			await fs.writeFile(
				deleteSessionPath,
				`${JSON.stringify({ type: "session", id: deleteSessionId, timestamp: Date.now() })}\n`,
				"utf-8",
			);

			const resDelete = await fetch(`http://localhost:${port}/api/sessions/delete`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: deleteSessionPath }),
			});
			expect(resDelete.status).toBe(200);

			const existsAfterDelete = await fs.stat(deleteSessionPath).then(
				() => true,
				() => false,
			);
			expect(existsAfterDelete).toBe(false);

			// Check routing to settings works through combined handler
			const resSettingsTabs = await fetch(`http://localhost:${port}/api/settings/tabs`);
			expect(resSettingsTabs.status).toBe(200);
		} finally {
			server.stop();
		}
	});
});
