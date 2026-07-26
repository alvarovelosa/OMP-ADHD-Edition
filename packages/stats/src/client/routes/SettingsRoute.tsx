import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import {
	ApiError,
	clearHiddenSettings,
	getSettingsTab,
	getSettingsTabs,
	setSettingValue,
	toggleSettingHidden,
} from "../api";
import { SettingRow } from "../components/SettingRow";
import { SettingsDescriptionBar } from "../components/SettingsDescriptionBar";
import { SettingsTabStrip } from "../components/SettingsTabStrip";
import { useResource } from "../data/useResource";
import type { SettingsField, SettingTabId } from "../types";
import { AsyncBoundary } from "../ui";

export interface SettingsRouteProps {
	active: boolean;
}

export function SettingsRoute({ active }: SettingsRouteProps) {
	const [activeTabId, setActiveTabId] = useState<SettingTabId | null>(null);
	const [focusedField, setFocusedField] = useState<SettingsField | null>(null);
	const [overlay, setOverlay] = useState<Map<string, { value: unknown; changed: boolean }>>(new Map());
	const [showHidden, setShowHidden] = useState(false);
	const {
		data: tabs,
		error: tabsError,
		loading: tabsLoading,
	} = useResource(["settings-tabs"], getSettingsTabs, {
		enabled: active,
	});

	useEffect(() => {
		if (tabs && tabs.length > 0 && !activeTabId) {
			setActiveTabId(tabs[0].id);
		}
	}, [tabs, activeTabId]);

	const {
		data: tabData,
		error: tabError,
		loading: tabLoading,
		refetch: refetchTab,
	} = useResource(
		["settings-tab", activeTabId],
		signal => (activeTabId ? getSettingsTab(activeTabId, signal) : Promise.reject(new Error("No tab selected"))),
		{
			enabled: active && activeTabId !== null,
		},
	);
	const isLoading = tabsLoading || (activeTabId !== null && tabLoading);
	const combinedError = tabsError
		? tabsError instanceof ApiError && tabsError.status === 404
			? new Error(
					"Settings editing isn't available from this dashboard server. This can happen if the dashboard was started by an older omp process — restart 'omp stats' (or the coding-agent session that opened it) to pick up settings support.",
				)
			: tabsError
		: tabError;

	const handleSelectTab = (id: SettingTabId) => {
		setActiveTabId(id);
		setFocusedField(null);
		setOverlay(new Map());
	};

	const handleFieldChange = async (path: string, value: unknown) => {
		const field = tabData?.fields.find(f => f.path === path);
		const defaultVal = field ? field.defaultValue : undefined;
		const isChanged =
			typeof value === "object" && value !== null
				? JSON.stringify(value) !== JSON.stringify(defaultVal)
				: value !== defaultVal;

		setOverlay(prev => {
			const next = new Map(prev);
			next.set(path, { value, changed: isChanged });
			return next;
		});

		try {
			const res = await setSettingValue(path, value);
			setOverlay(prev => {
				const next = new Map(prev);
				next.set(path, { value: res.value, changed: res.changed });
				return next;
			});
		} catch (err) {
			setOverlay(prev => {
				const next = new Map(prev);
				next.delete(path);
				return next;
			});
			throw err;
		}
	};

	const handleToggleHide = async (path: string, hidden: boolean) => {
		await toggleSettingHidden(path, hidden);
		refetchTab();
	};

	const handleClearHidden = async () => {
		await clearHiddenSettings();
		refetchTab();
	};

	const effectiveFields: SettingsField[] = (tabData?.fields ?? []).map(f => {
		const ov = overlay.get(f.path);
		if (ov) {
			return { ...f, value: ov.value, changed: ov.changed };
		}
		return f;
	});

	const groups = tabData?.groups ?? [];
	const visibleFields = effectiveFields.filter(f => showHidden || !f.hidden);
	const groupedFieldsMap = new Map<string | undefined, SettingsField[]>();
	for (const field of visibleFields) {
		const grp = field.group;
		if (!groupedFieldsMap.has(grp)) {
			groupedFieldsMap.set(grp, []);
		}
		groupedFieldsMap.get(grp)!.push(field);
	}
	return (
		<div className="stats-route-container stats-settings-container">
			<div className="stats-settings-toolbar">
				{tabs && tabs.length > 0 && activeTabId && (
					<SettingsTabStrip tabs={tabs} activeTabId={activeTabId} onSelect={handleSelectTab} />
				)}
				<div className="stats-settings-actions">
					<button
						type="button"
						className={`stats-settings-action-btn ${showHidden ? "is-active" : ""}`}
						onClick={() => setShowHidden(prev => !prev)}
						title={showHidden ? "Hide hidden settings" : "Show hidden settings"}
					>
						{showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
						<span>{showHidden ? "Hide Hidden" : "Show Hidden"}</span>
					</button>
					<button
						type="button"
						className="stats-settings-action-btn"
						onClick={handleClearHidden}
						title="Clear all hidden settings"
					>
						<RotateCcw size={14} />
						<span>Reset Hidden</span>
					</button>
				</div>
			</div>
			<div className="stats-settings-body">
				<AsyncBoundary
					loading={isLoading}
					error={combinedError ?? null}
					data={tabData ?? null}
					emptyText="No settings found for this tab."
				>
					<div className="stats-settings-content">
						{groupedFieldsMap.has(undefined) && (
							<div className="stats-settings-group-section">
								{groupedFieldsMap.get(undefined)!.map(field => (
									<SettingRow
										key={field.path}
										field={field}
										onChange={handleFieldChange}
										onToggleHide={handleToggleHide}
										onFocus={setFocusedField}
									/>
								))}
							</div>
						)}
						{groups.map(group => {
							const fieldsInGroup = groupedFieldsMap.get(group) ?? [];
							if (fieldsInGroup.length === 0) return null;
							return (
								<div key={group} className="stats-settings-group-section">
									<h3 className="stats-settings-group-title">{group}</h3>
									{fieldsInGroup.map(field => (
										<SettingRow
											key={field.path}
											field={field}
											onChange={handleFieldChange}
											onToggleHide={handleToggleHide}
											onFocus={setFocusedField}
										/>
									))}
								</div>
							);
						})}
					</div>
				</AsyncBoundary>
			</div>
			<SettingsDescriptionBar field={focusedField} />
		</div>
	);
}
