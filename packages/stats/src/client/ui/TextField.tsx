import type React from "react";
import { useEffect, useState } from "react";

export interface TextFieldProps {
	value: string;
	onChange: (next: string) => void;
	onCommit: (next: string) => void;
	multiline?: boolean;
	disabled?: boolean;
	invalid?: boolean;
}

export const TextField: React.FC<TextFieldProps> = ({
	value: externalValue,
	onChange,
	onCommit,
	multiline = false,
	disabled = false,
	invalid = false,
}) => {
	const [localValue, setLocalValue] = useState(externalValue);

	useEffect(() => {
		setLocalValue(externalValue);
	}, [externalValue]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		const val = e.target.value;
		setLocalValue(val);
		onChange(val);
	};

	const handleBlur = () => {
		if (!invalid) {
			onCommit(localValue);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		if (!multiline && e.key === "Enter") {
			e.preventDefault();
			if (!invalid) {
				onCommit(localValue);
			}
		}
	};

	if (multiline) {
		return (
			<textarea
				value={localValue}
				disabled={disabled}
				onChange={handleChange}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
				rows={4}
				className={`stats-settings-textfield multiline ${invalid ? "is-invalid" : ""}`}
			/>
		);
	}

	return (
		<input
			type="text"
			value={localValue}
			disabled={disabled}
			onChange={handleChange}
			onBlur={handleBlur}
			onKeyDown={handleKeyDown}
			className={`stats-settings-textfield ${invalid ? "is-invalid" : ""}`}
		/>
	);
};
