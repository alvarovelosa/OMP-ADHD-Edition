import type React from "react";
import type { SettingsField } from "../types";

export interface SettingsDescriptionBarProps {
	field: SettingsField | null;
}

export const SettingsDescriptionBar: React.FC<SettingsDescriptionBarProps> = ({ field }) => {
	return (
		<div className="stats-settings-description-bar">
			{field ? (
				<>
					<span className="stats-settings-desc-path">{field.path}:</span>{" "}
					<span className="stats-settings-desc-text">{field.description}</span>
				</>
			) : (
				<span className="stats-settings-desc-placeholder">Hover or select a setting to view details</span>
			)}
		</div>
	);
};
