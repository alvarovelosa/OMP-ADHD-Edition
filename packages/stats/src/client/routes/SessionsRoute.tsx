import { Archive, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { archiveSession, deleteSession, getSessionsList } from "../api";
import { formatCost, formatInteger, formatRelativeTime } from "../data/formatters";
import { useResource } from "../data/useResource";
import type { SessionListItem } from "../types";
import { AsyncBoundary, DataTable, Panel, SessionDrawer, StatusPill, statusPillVariant } from "../ui";

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
				render: (item: SessionListItem) => (
					<div>
						<div className="stats-font-medium stats-text-primary">{item.title}</div>
						<div className="stats-text-xs stats-text-muted">{item.cwd}</div>
					</div>
				),
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
		[],
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
						data={sessions || []}
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
