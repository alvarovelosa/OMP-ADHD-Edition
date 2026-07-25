import type React from "react";
import { useEffect, useState } from "react";

export interface TextFieldProps {
	value: string;
	onChange: (next: string) => void;
	onCommit?: (next: string) => void;
	placeholder?: string;
	icon?: React.ReactNode;
	multiline?: boolean;
	disabled?: boolean;
	invalid?: boolean;
	style?: React.CSSProperties;
}

export const TextField: React.FC<TextFieldProps> = ({
	value: externalValue,
	onChange,
	onCommit,
	placeholder,
	icon,
	multiline = false,
	disabled = false,
	invalid = false,
	style,
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
		if (!invalid && onCommit) {
			onCommit(localValue);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		if (!multiline && e.key === "Enter") {
			e.preventDefault();
			if (!invalid && onCommit) {
				onCommit(localValue);
			}
		}
	};

	if (multiline) {
		return (
			<textarea
				value={localValue}
				placeholder={placeholder}
				disabled={disabled}
				onChange={handleChange}
				onBlur={handleBlur}
				onKeyDown={handleKeyDown}
				rows={4}
				style={style}
				className={`stats-settings-textfield multiline ${invalid ? "is-invalid" : ""}`}
			/>
		);
	}

	if (icon) {
		return (
			<div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
				<div
					style={{
						position: "absolute",
						left: "10px",
						pointerEvents: "none",
						display: "flex",
						alignItems: "center",
						color: "var(--text-dim, #888)",
						opacity: 0.7,
					}}
				>
					{icon}
				</div>
				<input
					type="text"
					value={localValue}
					placeholder={placeholder}
					disabled={disabled}
					onChange={handleChange}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
					style={{ paddingLeft: "30px", ...style }}
					className={`stats-settings-textfield ${invalid ? "is-invalid" : ""}`}
				/>
			</div>
		);
	}

	return (
		<input
			type="text"
			value={localValue}
			placeholder={placeholder}
			disabled={disabled}
			onChange={handleChange}
			onBlur={handleBlur}
			onKeyDown={handleKeyDown}
			style={style}
			className={`stats-settings-textfield ${invalid ? "is-invalid" : ""}`}
		/>
	);
};
