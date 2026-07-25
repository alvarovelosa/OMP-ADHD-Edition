import type React from "react";

export interface ToggleProps {
	checked: boolean;
	onChange: (next: boolean) => void;
	disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled }) => {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={`stats-settings-toggle ${checked ? "is-checked" : ""}`}
		>
			<span className="stats-settings-toggle-thumb" />
		</button>
	);
};
