import { Archive, Clock, Coins, FileText, Folder, HardDrive, Hash, Play, Trash2, X } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { archiveSession, deleteSession, getSessionMessages, resumeSession } from "../api";
import { formatBytes, formatCost, formatInteger, formatRelativeTime } from "../data/formatters";
import type { SessionListItem, SessionMessageEntry, SessionStatus } from "../types";
import { JsonBlock } from "./JsonBlock";
import { SegmentedControl } from "./SegmentedControl";
import { parseSessionMessage, SessionMessageBlock } from "./SessionMessageBlock";
import { Skeleton } from "./Skeleton";
import { StatusPill } from "./StatusPill";
import { Toggle } from "./Toggle";

export interface SessionDrawerProps {
	session: SessionListItem | null;
	onClose: () => void;
	onArchived: () => void;
	onDeleted: () => void;
}

export function statusPillVariant(status: SessionStatus): "success" | "danger" | "warning" | "info" | "default" {
	switch (status) {
		case "complete":
			return "success";
		case "error":
		case "aborted":
			return "danger";
		case "interrupted":
			return "warning";
		case "pending":
			return "info";
		default:
			return "default";
	}
}

export function SessionDrawer({ session, onClose, onArchived, onDeleted }: SessionDrawerProps) {
	const [messages, setMessages] = useState<SessionMessageEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [hasMore, setHasMore] = useState(false);
	const [mode, setMode] = useState<"recent" | "full">("recent");
	const [loadingMessages, setLoadingMessages] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [actionBusy, setActionBusy] = useState(false);
	const [resumeInFlight, setResumeInFlight] = useState(false);
	const [resumeMessage, setResumeMessage] = useState<string | null>(null);
	const resumeMessageTimer = useRef<number>(0);

	useEffect(() => () => window.clearTimeout(resumeMessageTimer.current), []);
	const [viewMode, setViewMode] = useState<"easy" | "json">("easy");
	const [hideTools, setHideTools] = useState(false);

	const previousActiveElement = useRef<HTMLElement | null>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (session === null) return;

		previousActiveElement.current = document.activeElement as HTMLElement | null;
		setMessages([]);
		setTotal(0);
		setHasMore(false);
		setMode("recent");
		setError(null);
		setActionError(null);
		setLoadingMessages(true);

		const controller = new AbortController();
		getSessionMessages(session.path, { mode: "recent", count: 10 }, controller.signal)
			.then(res => {
				if (controller.signal.aborted) return;
				setMessages(res.messages);
				setTotal(res.total);
				setHasMore(res.hasMore);
			})
			.catch(err => {
				if (controller.signal.aborted) return;
				setError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoadingMessages(false);
			});

		return () => controller.abort();
	}, [session]);

	useEffect(() => {
		if (session === null) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		closeButtonRef.current?.focus();

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			previousActiveElement.current?.focus();
		};
	}, [session, onClose]);

	const filteredMessages = useMemo(() => {
		if (!hideTools) return messages;
		return messages.filter(entry => {
			const parsed = parseSessionMessage(entry.message);
			if (!parsed.recognized) return true;
			if (parsed.role === "toolResult") return false;
			if (parsed.role === "assistant" && parsed.toolCalls.length > 0 && parsed.text.trim().length === 0)
				return false;
			return true;
		});
	}, [messages, hideTools]);

	if (session === null) return null;

	const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	const handleLoadMore = async () => {
		if (loadingMore || !hasMore || mode !== "recent") return;
		setLoadingMore(true);
		try {
			const beforeIndex = messages[0]?.index ?? total;
			const res = await getSessionMessages(session.path, { mode: "recent", count: 10, before: beforeIndex });
			setMessages(prev => [...res.messages, ...prev]);
			setHasMore(res.hasMore);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoadingMore(false);
		}
	};

	const handleLoadFull = async () => {
		if (loadingMessages) return;
		setLoadingMessages(true);
		try {
			const res = await getSessionMessages(session.path, { mode: "full" });
			setMessages(res.messages);
			setTotal(res.total);
			setHasMore(false);
			setMode("full");
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoadingMessages(false);
		}
	};

	const handleResume = async () => {
		if (actionBusy) return;
		setActionBusy(true);
		setResumeInFlight(true);
		setActionError(null);
		setResumeMessage(null);
		try {
			await resumeSession(session.path);
			setResumeMessage(`Launched session ${session.path} in a new terminal window.`);
			window.clearTimeout(resumeMessageTimer.current);
			resumeMessageTimer.current = window.setTimeout(() => setResumeMessage(null), 4000);
		} catch (err) {
			setActionError(err instanceof Error ? err.message : String(err));
		} finally {
			setResumeInFlight(false);
			setActionBusy(false);
		}
	};

	const handleArchive = async () => {
		if (actionBusy) return;
		if (!window.confirm("Archive this session?")) return;
		setActionBusy(true);
		setActionError(null);
		try {
			await archiveSession(session.path);
			onArchived();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : String(err));
		} finally {
			setActionBusy(false);
		}
	};

	const handleDelete = async () => {
		if (actionBusy) return;
		if (!window.confirm("Permanently delete this session?")) return;
		setActionBusy(true);
		setActionError(null);
		try {
			await deleteSession(session.path);
			onDeleted();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : String(err));
		} finally {
			setActionBusy(false);
		}
	};

	return (
		<div className="stats-drawer-overlay" onClick={handleOverlayClick} role="presentation">
			<div className="stats-drawer" role="dialog" aria-modal="true" aria-label="Session details">
				{/* Drawer Header */}
				<div className="stats-drawer-header">
					<div className="stats-drawer-header-left" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
						<h2
							className="stats-drawer-title"
							style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
						>
							{session.title}
						</h2>
						<span className="stats-drawer-id" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
							<Folder size={12} /> {session.cwd}
						</span>
					</div>
					<button
						ref={closeButtonRef}
						type="button"
						onClick={onClose}
						className="stats-drawer-close-btn"
						aria-label="Close session details"
					>
						<X size={18} />
					</button>
				</div>

				<div className="stats-drawer-body">
					{/* Status and Action Buttons Header Card */}
					<div className="stats-drawer-status-card">
						<div
							className="stats-drawer-status-row"
							style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
						>
							<StatusPill variant={statusPillVariant(session.status)}>{session.status}</StatusPill>

							<div style={{ display: "flex", gap: "8px" }}>
								<button
									type="button"
									onClick={handleResume}
									disabled={actionBusy}
									className="stats-sessions-action-btn"
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: "4px",
										padding: "4px 8px",
										fontSize: "12px",
									}}
								>
									<Play size={14} /> {resumeInFlight ? "Launching…" : "Resume"}
								</button>
								{!session.archived && (
									<button
										type="button"
										onClick={handleArchive}
										disabled={actionBusy}
										className="stats-sessions-action-btn"
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: "4px",
											padding: "4px 8px",
											fontSize: "12px",
										}}
									>
										<Archive size={14} /> Archive
									</button>
								)}
								<button
									type="button"
									onClick={handleDelete}
									disabled={actionBusy}
									className="stats-sessions-action-btn stats-sessions-delete-btn"
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: "4px",
										padding: "4px 8px",
										fontSize: "12px",
									}}
								>
									<Trash2 size={14} /> Delete
								</button>
							</div>
						</div>

						{actionError && (
							<div className="stats-drawer-error-block" style={{ marginTop: "8px" }}>
								<div className="stats-drawer-error-label">Action Failed</div>
								<div className="stats-drawer-error-text">{actionError}</div>
							</div>
						)}

						{resumeMessage && (
							<div
								className="stats-drawer-success"
								style={{ marginTop: "8px", borderRadius: "var(--radius-lg, 8px)" }}
							>
								<div className="stats-drawer-success-title">Terminal launched</div>
								<div className="stats-drawer-success-message">{resumeMessage}</div>
							</div>
						)}
					</div>

					{/* Metrics Grid */}
					<div className="stats-drawer-metrics-grid">
						<div className="stats-drawer-metric-card">
							<div className="stats-drawer-metric-label">
								<FileText size={14} className="stats-drawer-metric-icon" />
								Messages
							</div>
							<div className="stats-drawer-metric-value">{formatInteger(session.messageCount)}</div>
						</div>

						<div className="stats-drawer-metric-card">
							<div className="stats-drawer-metric-label">
								<HardDrive size={14} className="stats-drawer-metric-icon" />
								Size
							</div>
							<div className="stats-drawer-metric-value">{formatBytes(session.size)}</div>
						</div>

						<div className="stats-drawer-metric-card">
							<div className="stats-drawer-metric-label">
								<Clock size={14} className="stats-drawer-metric-icon" />
								Modified
							</div>
							<div className="stats-drawer-metric-value">{formatRelativeTime(session.modified)}</div>
						</div>

						{session.usage && (
							<>
								<div className="stats-drawer-metric-card">
									<div className="stats-drawer-metric-label">
										<Coins size={14} className="stats-drawer-metric-icon" />
										Cost
									</div>
									<div className="stats-drawer-metric-value">{formatCost(session.usage.totalCost, 4)}</div>
								</div>

								<div className="stats-drawer-metric-card">
									<div className="stats-drawer-metric-label">
										<Hash size={14} className="stats-drawer-metric-icon" />
										Tokens
									</div>
									<div className="stats-drawer-metric-value">{formatInteger(session.usage.totalTokens)}</div>
								</div>
							</>
						)}
					</div>

					{/* Transcript Controls */}
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							flexWrap: "wrap",
							gap: "8px",
							margin: "16px 0 8px 0",
						}}
					>
						<h3 style={{ fontSize: "14px", fontWeight: 600, margin: 0 }}>Transcript</h3>
						<div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
							<SegmentedControl
								value={viewMode}
								onChange={setViewMode}
								options={[
									{ value: "easy", label: "Easy Reading" },
									{ value: "json", label: "JSON" },
								]}
							/>
							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: "6px",
									fontSize: "12px",
									color: "var(--muted)",
									cursor: "pointer",
								}}
							>
								<Toggle checked={hideTools} onChange={setHideTools} />
								{hideTools ? "Hide tools" : "Show tools"}
							</label>
							<div style={{ display: "flex", gap: "8px" }}>
								{hasMore && mode === "recent" && (
									<button
										type="button"
										onClick={handleLoadMore}
										disabled={loadingMore}
										className="stats-sessions-action-btn"
										style={{ padding: "4px 8px", fontSize: "12px" }}
									>
										{loadingMore ? "Loading..." : "Load older messages"}
									</button>
								)}
								{mode !== "full" && (
									<button
										type="button"
										onClick={handleLoadFull}
										disabled={loadingMessages}
										className="stats-sessions-action-btn"
										style={{ padding: "4px 8px", fontSize: "12px" }}
									>
										Load full transcript
									</button>
								)}
							</div>
						</div>
					</div>

					{/* Messages Content */}
					{loadingMessages && (
						<div className="stats-drawer-loading">
							<Skeleton variant="rect" width="100%" height={80} className="mb-4" />
							<Skeleton variant="rect" width="100%" height={120} className="mb-4" />
							<Skeleton variant="rect" width="100%" height={200} />
						</div>
					)}

					{error && (
						<div className="stats-drawer-error">
							<p className="stats-drawer-error-title">Failed to load transcript</p>
							<p className="stats-drawer-error-message">{error}</p>
						</div>
					)}

					{!loadingMessages && !error && (
						<div
							className="stats-drawer-content"
							style={{ display: "flex", flexDirection: "column", gap: "8px" }}
						>
							{messages.length === 0 ? (
								<p style={{ color: "var(--muted)", fontSize: "13px" }}>No message entries found in session.</p>
							) : filteredMessages.length === 0 ? (
								<p style={{ color: "var(--muted)", fontSize: "13px" }}>
									All messages hidden by the tool filter.
								</p>
							) : (
								filteredMessages.map(entry =>
									viewMode === "easy" ? (
										<SessionMessageBlock
											key={entry.index}
											entryIndex={entry.index}
											message={entry.message}
											hideTools={hideTools}
										/>
									) : (
										<JsonBlock
											key={entry.index}
											data={entry.message}
											title={`#${entry.index} ${typeof entry.message === "object" && entry.message !== null && "role" in entry.message ? String((entry.message as { role?: unknown }).role ?? "message") : "message"}`}
											initialCollapsed
										/>
									),
								)
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
