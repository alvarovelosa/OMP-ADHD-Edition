import type React from "react";
import type { SettingsTabSummary, SettingTabId } from "../types";

export interface SettingsTabStripProps {
	tabs: SettingsTabSummary[];
	activeTabId: SettingTabId;
	onSelect: (id: SettingTabId) => void;
}

export const SettingsTabStrip: React.FC<SettingsTabStripProps> = ({ tabs, activeTabId, onSelect }) => {
	return (
		<div className="stats-settings-tab-strip">
			{tabs.map(tab => {
				const isActive = tab.id === activeTabId;
				return (
					<button
						key={tab.id}
						type="button"
						className={`stats-settings-tab-btn ${isActive ? "is-active" : ""}`}
						onClick={() => onSelect(tab.id)}
					>
						{tab.label}
					</button>
				);
			})}
		</div>
	);
};
