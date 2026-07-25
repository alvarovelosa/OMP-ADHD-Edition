import type React from "react";

export interface DropdownOption {
	value: string;
	label: string;
}

export interface DropdownProps {
	value: string;
	options: DropdownOption[];
	onChange: (next: string) => void;
	disabled?: boolean;
}

export const Dropdown: React.FC<DropdownProps> = ({ value, options, onChange, disabled }) => {
	return (
		<select
			value={value}
			disabled={disabled}
			onChange={e => onChange(e.target.value)}
			className="stats-settings-dropdown"
		>
			{options.map(opt => (
				<option key={opt.value} value={opt.value}>
					{opt.label}
				</option>
			))}
		</select>
	);
};
