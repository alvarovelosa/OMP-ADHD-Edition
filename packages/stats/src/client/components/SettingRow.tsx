import { Eye, EyeOff } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { SettingsField } from "../types";
import { Dropdown, TextField, Toggle } from "../ui";

export interface SettingRowProps {
	field: SettingsField;
	onChange: (path: string, value: unknown) => Promise<void>;
	onToggleHide?: (path: string, hidden: boolean) => Promise<void>;
	onFocus: (field: SettingsField) => void;
}

export const SettingRow: React.FC<SettingRowProps> = ({ field, onChange, onToggleHide, onFocus }) => {
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [invalid, setInvalid] = useState(false);

	const isRecord = typeof field.value === "object" && field.value !== null;

	const handleValueChange = async (val: unknown) => {
		try {
			setErrorMsg(null);
			setInvalid(false);
			await onChange(field.path, val);
		} catch (err) {
			setErrorMsg(err instanceof Error ? err.message : String(err));
		}
	};

	let control: React.ReactNode;

	if (field.type === "boolean") {
		control = <Toggle checked={Boolean(field.value)} onChange={checked => handleValueChange(checked)} />;
	} else if (field.type === "enum") {
		const options = (field.enumValues ?? []).map(v => ({ value: v, label: v }));
		control = (
			<Dropdown value={String(field.value ?? "")} options={options} onChange={val => handleValueChange(val)} />
		);
	} else if (field.type === "submenu") {
		const options = (field.options ?? []).map(o => ({ value: o.value, label: o.label }));
		control = (
			<Dropdown value={String(field.value ?? "")} options={options} onChange={val => handleValueChange(val)} />
		);
	} else if (isRecord) {
		const formattedJson = JSON.stringify(field.value, null, 2);
		control = (
			<TextField
				value={formattedJson}
				multiline
				invalid={invalid}
				onChange={() => setInvalid(false)}
				onCommit={text => {
					try {
						const parsed = JSON.parse(text);
						setInvalid(false);
						handleValueChange(parsed);
					} catch {
						setInvalid(true);
					}
				}}
			/>
		);
	} else {
		control = (
			<TextField
				value={String(field.value ?? "")}
				invalid={invalid}
				onChange={() => setInvalid(false)}
				onCommit={text => handleValueChange(text)}
			/>
		);
	}

	return (
		<div
			className={`stats-settings-row ${field.changed ? "is-changed" : ""} ${field.hidden ? "is-hidden" : ""}`}
			onMouseEnter={() => onFocus(field)}
			onFocus={() => onFocus(field)}
		>
			<div className="stats-settings-row-label">
				<span className="stats-settings-field-name">{field.label}</span>
				{field.changed && <span className="stats-settings-changed-badge">modified</span>}
				{field.hidden && <span className="stats-settings-hidden-badge">hidden</span>}
			</div>
			<div className="stats-settings-row-control">
				<div className="stats-settings-control-wrapper">
					{control}
					{onToggleHide && (
						<button
							type="button"
							className="stats-settings-hide-btn"
							title={field.hidden ? "Unhide setting" : "Hide setting"}
							onClick={e => {
								e.stopPropagation();
								onToggleHide(field.path, !field.hidden);
							}}
						>
							{field.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
						</button>
					)}
				</div>
				{errorMsg && <div className="stats-settings-row-error">{errorMsg}</div>}
			</div>
		</div>
	);
};
