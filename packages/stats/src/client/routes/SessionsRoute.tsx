import { Archive, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { archiveSession, deleteSession, getSessionsList } from "../api";
import { formatCost, formatInteger, formatRelativeTime } from "../data/formatters";
import { useResource } from "../data/useResource";
import type { SessionListItem } from "../types";
import { AsyncBoundary, DataTable, Panel, SessionDrawer, StatusPill, statusPillVariant } from "../ui";

/** Sessions below this count are shown individually (no grouping). */
const GROUP_THRESHOLD = 2;

interface GroupMeta {
	key: string;
	size: number;
	expanded: boolean;
	/** 0 = representative (latest), 1+ = child attempt within an expanded group. */
	childIndex: number;
}

export interface SessionsRouteProps {
	active: boolean;
}

export function SessionsRoute({ active }: SessionsRouteProps) {
	const [selectedSession, setSelectedSession] = useState<SessionListItem | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	const {
		data: sessions,
		error,
		loading,
		refetch,
	} = useResource(["sessions-list"], getSessionsList, {
		pollMs: 30000,
		enabled: active,
	});
	const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

	const toggleGroup = (key: string) => {
		setExpandedGroups(prev => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	/** Flat display list: collapsed groups show only the latest session; expanded groups show all. */
	const { displaySessions, sessionGroupMeta } = useMemo(() => {
		const raw = sessions ?? [];
		// Sessions arrive newest-first from the API.
		const groups = new Map<string, SessionListItem[]>();
		for (const s of raw) {
			// Skip grouping for untitled / empty-title sessions.
			const norm = s.title.replace(/^#\d+\s+/, "").trim();
			if (!norm || norm === "Untitled") {
				groups.set(`__single__${s.path}`, [s]);
				continue;
			}
			const key = `${s.cwd}::${norm}`;
			const arr = groups.get(key);
			if (arr) arr.push(s);
			else groups.set(key, [s]);
		}

		const displaySessions: SessionListItem[] = [];
		const sessionGroupMeta = new Map<string, GroupMeta>();

		for (const [key, groupSessions] of groups) {
			const isGrouped = key.startsWith("__single__") ? false : groupSessions.length >= GROUP_THRESHOLD;
			if (!isGrouped) {
				for (const s of groupSessions) {
					displaySessions.push(s);
					sessionGroupMeta.set(s.path, { key, size: 1, expanded: false, childIndex: 0 });
				}
				continue;
			}

			const expanded = expandedGroups.has(key);
			// Representative is the first (newest) session in the group.
			displaySessions.push(groupSessions[0]);
			sessionGroupMeta.set(groupSessions[0].path, {
				key,
				size: groupSessions.length,
				expanded,
				childIndex: 0,
			});
			if (expanded) {
				for (let i = 1; i < groupSessions.length; i++) {
					displaySessions.push(groupSessions[i]);
					sessionGroupMeta.set(groupSessions[i].path, {
						key,
						size: groupSessions.length,
						expanded,
						childIndex: i,
					});
				}
			}
		}

		return { displaySessions, sessionGroupMeta };
	}, [sessions, expandedGroups]);

	const handleArchiveSession = async (e: React.MouseEvent, item: SessionListItem) => {
		e.stopPropagation();
		if (!window.confirm("Archive this session?")) return;
		setActionError(null);
		try {
			await archiveSession(item.path);
			refetch();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : String(err));
		}
	};

	const handleDeleteSession = async (e: React.MouseEvent, item: SessionListItem) => {
		e.stopPropagation();
		if (!window.confirm("Permanently delete this session?")) return;
		setActionError(null);
		try {
			await deleteSession(item.path);
			refetch();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : String(err));
		}
	};

	const columns = useMemo(
		() => [
			{
				key: "title",
				header: "Title",
				render: (item: SessionListItem) => {
					const gm = sessionGroupMeta.get(item.path);
					const isGroupRep = gm && gm.size >= GROUP_THRESHOLD && gm.childIndex === 0;
					const isChild = gm && gm.childIndex > 0;
					return (
						<div style={isChild ? { paddingLeft: "20px", opacity: 0.85 } : undefined}>
							{isGroupRep && (
								<button
									type="button"
									onClick={e => {
										e.stopPropagation();
										toggleGroup(gm.key);
									}}
									title={gm.expanded ? "Collapse group" : "Expand group"}
									style={{
										display: "inline-flex",
										alignItems: "center",
										background: "none",
										border: "none",
										cursor: "pointer",
										padding: 0,
										marginRight: "4px",
										verticalAlign: "middle",
									}}
								>
									{gm.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
								</button>
							)}
							<span className="stats-font-medium stats-text-primary">{item.title}</span>
							{isGroupRep && (
								<span
									className="stats-text-xs stats-text-muted"
									style={{ marginLeft: "6px", fontWeight: "normal" }}
								>
									({gm.size} attempts)
								</span>
							)}
							<div className="stats-text-xs stats-text-muted">{item.cwd}</div>
						</div>
					);
				},
			},
			{
				key: "status",
				header: "Status",
				className: "stats-text-center",
				render: (item: SessionListItem) => (
					<StatusPill variant={statusPillVariant(item.status)}>{item.status}</StatusPill>
				),
			},
			{
				key: "messageCount",
				header: "Messages",
				numeric: true,
				render: (item: SessionListItem) => formatInteger(item.messageCount),
			},
			{
				key: "cost",
				header: "Cost",
				numeric: true,
				render: (item: SessionListItem) => formatCost(item.usage?.totalCost ?? 0, 4),
			},
			{
				key: "tokens",
				header: "Tokens",
				numeric: true,
				render: (item: SessionListItem) => formatInteger(item.usage?.totalTokens ?? 0),
			},
			{
				key: "modified",
				header: "Modified",
				render: (item: SessionListItem) => formatRelativeTime(item.modified),
			},
			{
				key: "actions",
				header: "Actions",
				className: "stats-text-right",
				render: (item: SessionListItem) => (
					<div style={{ display: "inline-flex", gap: "6px" }} onClick={e => e.stopPropagation()}>
						<button
							type="button"
							onClick={e => handleArchiveSession(e, item)}
							className="stats-sessions-action-btn"
							title="Archive session"
							style={{
								padding: "3px 6px",
								fontSize: "12px",
								display: "inline-flex",
								alignItems: "center",
								gap: "3px",
							}}
						>
							<Archive size={13} /> Archive
						</button>
						<button
							type="button"
							onClick={e => handleDeleteSession(e, item)}
							className="stats-sessions-action-btn stats-sessions-delete-btn"
							title="Delete session"
							style={{
								padding: "3px 6px",
								fontSize: "12px",
								display: "inline-flex",
								alignItems: "center",
								gap: "3px",
							}}
						>
							<Trash2 size={13} /> Delete
						</button>
					</div>
				),
			},
		],
		[sessionGroupMeta, toggleGroup],
	);

	const renderMobileCard = (item: SessionListItem, onClick?: () => void) => (
		<div className="stats-mobile-card" onClick={onClick}>
			<div className="stats-mobile-card-header">
				<div>
					<div className="stats-font-semibold stats-text-primary">{item.title}</div>
					<div className="stats-text-xs stats-text-muted">{item.cwd}</div>
				</div>
				<StatusPill variant={statusPillVariant(item.status)}>{item.status}</StatusPill>
			</div>
			<div className="stats-mobile-card-grid">
				<div>
					<div className="stats-mobile-card-label">Messages</div>
					<div className="stats-mobile-card-value">{formatInteger(item.messageCount)}</div>
				</div>
				<div>
					<div className="stats-mobile-card-label">Cost</div>
					<div className="stats-mobile-card-value">{formatCost(item.usage?.totalCost ?? 0, 4)}</div>
				</div>
				<div>
					<div className="stats-mobile-card-label">Tokens</div>
					<div className="stats-mobile-card-value">{formatInteger(item.usage?.totalTokens ?? 0)}</div>
				</div>
				<div>
					<div className="stats-mobile-card-label">Modified</div>
					<div className="stats-mobile-card-value">{formatRelativeTime(item.modified)}</div>
				</div>
			</div>
			<div
				style={{ marginTop: "8px", display: "flex", justifyContent: "flex-end", gap: "8px" }}
				onClick={e => e.stopPropagation()}
			>
				<button
					type="button"
					onClick={e => handleArchiveSession(e, item)}
					className="stats-sessions-action-btn"
					style={{ padding: "3px 8px", fontSize: "12px" }}
				>
					Archive
				</button>
				<button
					type="button"
					onClick={e => handleDeleteSession(e, item)}
					className="stats-sessions-action-btn stats-sessions-delete-btn"
					style={{ padding: "3px 8px", fontSize: "12px" }}
				>
					Delete
				</button>
			</div>
		</div>
	);

	return (
		<div className="stats-route-container">
			{actionError && (
				<div className="stats-drawer-error" style={{ marginBottom: "12px" }}>
					<p className="stats-drawer-error-title">Action Failed</p>
					<p className="stats-drawer-error-message">{actionError}</p>
				</div>
			)}
			<Panel title="Sessions" subtitle="Browse, view transcript, archive, or delete OMP sessions">
				<AsyncBoundary loading={loading} error={error} data={sessions}>
					<DataTable
						columns={columns}
						data={displaySessions}
						keyExtractor={item => item.path}
						onRowClick={item => setSelectedSession(item)}
						renderMobileCard={renderMobileCard}
						emptyText="No sessions found"
					/>
				</AsyncBoundary>
			</Panel>

			<SessionDrawer
				session={selectedSession}
				onClose={() => setSelectedSession(null)}
				onArchived={() => {
					setSelectedSession(null);
					refetch();
				}}
				onDeleted={() => {
					setSelectedSession(null);
					refetch();
				}}
			/>
		</div>
	);
}
