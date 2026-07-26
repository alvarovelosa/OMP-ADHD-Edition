import * as path from "node:path";
import { gunzipSync } from "node:zlib";
import { getSessionUsageMap } from "@oh-my-pi/omp-stats";
import { getAgentDir, getSessionsDir, isEnoent, parseJsonlLenient } from "@oh-my-pi/pi-utils";
import { archiveDestination, getArchivedSessionsDir, moveSessionWithArtifacts } from "../cli/gc-cli";
import { applyDashboardCors } from "../utils/dashboard-cors";
import { openTerminalCommand } from "../utils/open";
import { listAllSessions, listArchivedSessions, type SessionStatus, sessionDisplayName } from "./session-listing";
import { FileSessionStorage } from "./session-storage";

export interface SessionListItem {
	path: string;
	id: string;
	cwd: string;
	title: string;
	parentSessionPath?: string;
	created: number;
	modified: number;
	messageCount: number;
	size: number;
	firstMessage: string;
	status: SessionStatus;
	seq?: number;
	archived: boolean;
	usage?: { requestCount: number; totalTokens: number; totalCost: number };
}

export interface SessionMessageEntry {
	index: number;
	message: unknown;
}

export interface SessionMessagesResponse {
	messages: SessionMessageEntry[];
	total: number;
	hasMore: boolean;
}

async function readSessionContent(p: string): Promise<string> {
	if (p.endsWith(".gz")) return new TextDecoder("utf-8").decode(gunzipSync(await Bun.file(p).bytes()));
	return new FileSessionStorage().readText(p);
}

export async function handleSessionsApiRequest(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const pathname = url.pathname;
	let response: Response;

	if (req.method === "GET" && pathname === "/api/sessions/list") {
		const limitParam = url.searchParams.get("limit");
		let limit = 200;
		if (limitParam) {
			const parsed = Number.parseInt(limitParam, 10);
			if (Number.isFinite(parsed) && parsed >= 1) {
				limit = parsed;
			}
		}

		const includeArchived = url.searchParams.get("includeArchived") === "1";
		const sessions = includeArchived
			? [...(await listAllSessions()), ...(await listArchivedSessions())].sort(
					(a, b) => b.modified.getTime() - a.modified.getTime(),
				)
			: await listAllSessions();
		const usage = await getSessionUsageMap();

		const q = url.searchParams.get("q")?.trim().toLowerCase();
		const filtered = q
			? sessions.filter(
					s =>
						sessionDisplayName(s).toLowerCase().includes(q) ||
						s.cwd.toLowerCase().includes(q) ||
						s.firstMessage.toLowerCase().includes(q) ||
						s.allMessagesText.toLowerCase().includes(q),
				)
			: sessions;

		const items: SessionListItem[] = filtered.slice(0, limit).map(info => ({
			path: info.path,
			id: info.id,
			cwd: info.cwd,
			title: sessionDisplayName(info),
			parentSessionPath: info.parentSessionPath,
			created: info.created.getTime(),
			modified: info.modified.getTime(),
			messageCount: info.messageCount,
			size: info.size,
			firstMessage: info.firstMessage,
			status: info.status ?? "unknown",
			seq: info.seq,
			archived: info.archived ?? false,
			usage: usage[info.path],
		}));

		response = Response.json(items);
	} else if (req.method === "GET" && pathname === "/api/sessions/messages") {
		const sessionPath = url.searchParams.get("path");
		if (!sessionPath) {
			response = Response.json({ error: "Missing session path" }, { status: 400 });
		} else {
			const agentDir = getAgentDir();
			const sessionsRoot = path.resolve(getSessionsDir(agentDir));
			const archivedRoot = path.resolve(getArchivedSessionsDir(agentDir));
			const resolvedPath = path.resolve(sessionPath);
			const withinManagedRoots =
				resolvedPath.startsWith(sessionsRoot + path.sep) || resolvedPath.startsWith(archivedRoot + path.sep);
			if (!withinManagedRoots) {
				response = Response.json({ error: "Path is outside the managed sessions directory" }, { status: 400 });
			} else {
				let content: string;
				try {
					content = await readSessionContent(resolvedPath);
				} catch (err) {
					if (isEnoent(err)) {
						return applyDashboardCors(req, Response.json({ error: "Session not found" }, { status: 404 }));
					}
					throw err;
				}

				const entries = parseJsonlLenient<Record<string, unknown>>(content);
				const allMessages: SessionMessageEntry[] = entries
					.filter(entry => entry.type === "message")
					.map((entry, index) => ({ index, message: entry.message }));

				const mode = url.searchParams.get("mode");
				if (mode === "full") {
					response = Response.json({
						messages: allMessages,
						total: allMessages.length,
						hasMore: false,
					});
				} else if (mode === "recent") {
					const countParam = url.searchParams.get("count");
					let count = 10;
					if (countParam) {
						const parsedCount = Number.parseInt(countParam, 10);
						if (Number.isFinite(parsedCount) && parsedCount >= 1) {
							count = parsedCount;
						}
					}

					const beforeParam = url.searchParams.get("before");
					let before = allMessages.length;
					if (beforeParam) {
						const parsedBefore = Number.parseInt(beforeParam, 10);
						if (Number.isFinite(parsedBefore)) {
							before = Math.max(0, Math.min(allMessages.length, parsedBefore));
						}
					}

					const start = Math.max(0, before - count);
					const page = allMessages.slice(start, before);

					response = Response.json({
						messages: page,
						total: allMessages.length,
						hasMore: start > 0,
					});
				} else {
					response = Response.json({ error: "Invalid mode" }, { status: 400 });
				}
			}
		}
	} else if (req.method === "POST" && pathname === "/api/sessions/archive") {
		let body: { path?: string } = {};
		try {
			body = (await req.json()) as { path?: string };
		} catch {
			// fallback empty body
		}

		const candidatePath = body?.path;
		if (!candidatePath || typeof candidatePath !== "string") {
			response = Response.json({ error: "Missing session path" }, { status: 400 });
		} else {
			const agentDir = getAgentDir();
			const sessionsRoot = path.resolve(getSessionsDir(agentDir));
			const resolvedPath = path.resolve(candidatePath);
			if (!resolvedPath.startsWith(sessionsRoot + path.sep)) {
				response = Response.json({ error: "Path is outside the managed sessions directory" }, { status: 400 });
			} else {
				const sessions = await listAllSessions();
				const session = sessions.find(s => s.path === resolvedPath);
				if (!session) {
					response = Response.json({ error: "Session not found" }, { status: 404 });
				} else {
					const archiveRoot = getArchivedSessionsDir(agentDir);
					const dest = archiveDestination(archiveRoot, sessionsRoot, session);
					if (!dest) {
						response = Response.json({ error: "Session path is not archivable" }, { status: 400 });
					} else {
						try {
							await moveSessionWithArtifacts({ session, ...dest });
							response = Response.json({ path: session.path, archivedTo: dest.destinationPath });
						} catch (err) {
							if (isEnoent(err)) {
								response = Response.json({ error: "Session not found" }, { status: 404 });
							} else {
								response = Response.json(
									{ error: err instanceof Error ? err.message : String(err) },
									{ status: 409 },
								);
							}
						}
					}
				}
			}
		}
	} else if (req.method === "POST" && pathname === "/api/sessions/delete") {
		let body: { path?: string } = {};
		try {
			body = (await req.json()) as { path?: string };
		} catch {
			// fallback empty body
		}

		const candidatePath = body?.path;
		if (!candidatePath || typeof candidatePath !== "string") {
			response = Response.json({ error: "Missing session path" }, { status: 400 });
		} else {
			const agentDir = getAgentDir();
			const sessionsRoot = path.resolve(getSessionsDir(agentDir));
			const archivedRoot = path.resolve(getArchivedSessionsDir(agentDir));
			const resolvedPath = path.resolve(candidatePath);
			const withinManagedRoots =
				resolvedPath.startsWith(sessionsRoot + path.sep) || resolvedPath.startsWith(archivedRoot + path.sep);
			if (!withinManagedRoots) {
				response = Response.json({ error: "Path is outside the managed sessions directory" }, { status: 400 });
			} else {
				try {
					await new FileSessionStorage().deleteSessionWithArtifacts(resolvedPath);
					response = Response.json({ path: resolvedPath, deleted: true });
				} catch (err) {
					if (isEnoent(err)) {
						response = Response.json({ error: "Session not found" }, { status: 404 });
					} else {
						throw err;
					}
				}
			}
		}
	} else if (req.method === "POST" && pathname === "/api/sessions/resume") {
		let body: { path?: string } = {};
		try {
			body = (await req.json()) as { path?: string };
		} catch {
			// fallback empty body
		}

		const candidatePath = body?.path;
		if (!candidatePath || typeof candidatePath !== "string") {
			response = Response.json({ error: "Missing session path" }, { status: 400 });
		} else {
			const agentDir = getAgentDir();
			const sessionsRoot = path.resolve(getSessionsDir(agentDir));
			const archivedRoot = path.resolve(getArchivedSessionsDir(agentDir));
			const resolvedPath = path.resolve(candidatePath);
			const withinManagedRoots =
				resolvedPath.startsWith(sessionsRoot + path.sep) || resolvedPath.startsWith(archivedRoot + path.sep);
			if (!withinManagedRoots) {
				response = Response.json({ error: "Path is outside the managed sessions directory" }, { status: 400 });
			} else {
				const sessions = [...(await listAllSessions()), ...(await listArchivedSessions())];
				const session = sessions.find(s => s.path === resolvedPath);
				if (!session) {
					response = Response.json({ error: "Session not found" }, { status: 404 });
				} else {
					try {
						await openTerminalCommand("omp", ["-r", session.id], session.cwd || process.cwd());
						response = Response.json({ ok: true });
					} catch (err) {
						response = Response.json(
							{ error: err instanceof Error ? err.message : String(err) },
							{ status: 500 },
						);
					}
				}
			}
		}
	} else {
		response = new Response("Not Found", { status: 404 });
	}

	return applyDashboardCors(req, response);
}
