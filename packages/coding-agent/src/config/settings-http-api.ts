import { getSettingDef, getSettingsForTab } from "../modes/components/settings-defs";
import { getAvailableThemes } from "../modes/theme/theme";
import { applyDashboardCors } from "../utils/dashboard-cors";
import { type SettingPath, type SettingValue, settings, validateProviderMaxInFlightRequests } from "./settings";
import {
	getDefault,
	getEnumValues,
	getType,
	SETTING_TABS,
	type SettingTab,
	TAB_GROUPS,
	TAB_METADATA,
} from "./settings-schema";

export type SettingsFieldType = "boolean" | "enum" | "multiselect" | "providerLimits" | "submenu" | "text";

export interface SettingsFieldOption {
	value: string;
	label: string;
	description?: string;
}

export interface SettingsField {
	path: string;
	label: string;
	description: string;
	group?: string;
	type: SettingsFieldType;
	value: unknown;
	defaultValue: unknown;
	changed: boolean;
	enumValues?: readonly string[];
	options?: readonly SettingsFieldOption[];
}

export interface SettingsTabSummary {
	id: SettingTab;
	label: string;
}

export interface SettingsTabPayload {
	id: SettingTab;
	label: string;
	groups: readonly string[];
	fields: SettingsField[];
}

function isChanged(value: unknown, defaultValue: unknown): boolean {
	if (typeof value === "object" && value !== null) {
		return JSON.stringify(value) !== JSON.stringify(defaultValue);
	}
	return value !== defaultValue;
}

export async function handleSettingsApiRequest(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const pathname = url.pathname;

	let response: Response;

	if (req.method === "GET" && pathname === "/api/settings/tabs") {
		const tabs: SettingsTabSummary[] = SETTING_TABS.map(id => ({
			id,
			label: TAB_METADATA[id].label,
		}));
		response = Response.json(tabs);
	} else if (req.method === "GET" && pathname.startsWith("/api/settings/tab/")) {
		const tabId = pathname.slice("/api/settings/tab/".length) as SettingTab;
		if (!SETTING_TABS.includes(tabId)) {
			response = Response.json({ error: "Unknown tab" }, { status: 400 });
		} else {
			const defs = getSettingsForTab(tabId).filter(def => !def.condition || def.condition());
			const availableThemes = tabId === "appearance" ? await getAvailableThemes() : [];

			const fields: SettingsField[] = defs.map(def => {
				const val = settings.get(def.path as SettingPath);
				const defaultVal = getDefault(def.path as SettingPath);
				const changed = isChanged(val, defaultVal);

				let options: readonly SettingsFieldOption[] | undefined;
				if (def.path === "theme.dark" || def.path === "theme.light") {
					options = availableThemes.map(name => ({ value: name, label: name }));
				} else if (def.type === "submenu") {
					options = def.options;
				}

				const field: SettingsField = {
					path: def.path,
					label: def.label,
					description: def.description,
					group: def.group,
					type: def.type,
					value: val,
					defaultValue: defaultVal,
					changed,
				};

				if (def.type === "enum") {
					field.enumValues = def.values;
				}
				if (options) {
					field.options = options;
				}

				return field;
			});

			const payload: SettingsTabPayload = {
				id: tabId,
				label: TAB_METADATA[tabId].label,
				groups: Array.from(TAB_GROUPS[tabId]),
				fields,
			};
			response = Response.json(payload);
		}
	} else if (req.method === "POST" && pathname === "/api/settings/value") {
		let body: { path?: string; value?: unknown };
		try {
			body = (await req.json()) as { path?: string; value?: unknown };
		} catch {
			body = {};
		}

		const pathStr = body.path;
		if (!pathStr || typeof pathStr !== "string") {
			response = Response.json({ error: "Missing setting path" }, { status: 400 });
		} else {
			const def = getSettingDef(pathStr as SettingPath);
			if (!def) {
				response = Response.json({ error: "Unknown setting" }, { status: 404 });
			} else {
				let valueToSet = body.value;
				const schemaType = getType(def.path as SettingPath);
				let validationError: string | undefined;

				if (schemaType === "boolean") {
					if (typeof valueToSet !== "boolean") {
						validationError = "Invalid boolean value";
					}
				} else if (schemaType === "number") {
					if (typeof valueToSet !== "number" || !Number.isFinite(valueToSet)) {
						validationError = "Invalid number value";
					} else if (def.type === "submenu" && def.options) {
						if (!def.options.some(o => o.value === String(valueToSet))) {
							validationError = "Invalid option choice";
						}
					}
				} else if (schemaType === "enum") {
					const allowedEnums = getEnumValues(def.path as SettingPath) ?? [];
					if (typeof valueToSet !== "string" || !allowedEnums.includes(valueToSet)) {
						validationError = "Invalid enum value";
					}
				} else if (schemaType === "string") {
					if (typeof valueToSet !== "string") {
						validationError = "Invalid string value";
					} else if (def.type === "submenu") {
						if (def.path === "theme.dark" || def.path === "theme.light") {
							const themes = await getAvailableThemes();
							if (!themes.includes(valueToSet)) {
								validationError = "Invalid theme choice";
							}
						} else if (def.options && !def.options.some(o => o.value === valueToSet)) {
							validationError = "Invalid option choice";
						}
					}
				} else if (schemaType === "record") {
					if (def.path === "providers.maxInFlightRequests") {
						try {
							valueToSet = validateProviderMaxInFlightRequests(valueToSet);
						} catch (err) {
							validationError = err instanceof Error ? err.message : String(err);
						}
					} else if (valueToSet === null || typeof valueToSet !== "object" || Array.isArray(valueToSet)) {
						validationError = "Invalid object value";
					}
				} else if (schemaType === "array") {
					validationError = "Unsupported setting type";
				} else {
					validationError = "Invalid value type";
				}

				if (validationError) {
					response = Response.json({ error: validationError }, { status: 400 });
				} else {
					settings.set(def.path as SettingPath, valueToSet as SettingValue<typeof def.path>);
					const updatedValue = settings.get(def.path as SettingPath);
					const defaultValue = getDefault(def.path as SettingPath);
					response = Response.json({
						path: def.path,
						value: updatedValue,
						changed: isChanged(updatedValue, defaultValue),
					});
				}
			}
		}
	} else if (req.method === "POST" && pathname === "/api/settings/reset") {
		let body: { path?: string };
		try {
			body = (await req.json()) as { path?: string };
		} catch {
			body = {};
		}

		const pathStr = body.path;
		if (!pathStr || typeof pathStr !== "string") {
			response = Response.json({ error: "Missing setting path" }, { status: 400 });
		} else {
			const def = getSettingDef(pathStr as SettingPath);
			if (!def) {
				response = Response.json({ error: "Unknown setting" }, { status: 404 });
			} else {
				const defaultValue = getDefault(def.path as SettingPath);
				settings.set(def.path as SettingPath, defaultValue as SettingValue<typeof def.path>);
				response = Response.json({
					path: def.path,
					value: settings.get(def.path as SettingPath),
					changed: false,
				});
			}
		}
	} else {
		response = new Response("Not Found", { status: 404 });
	}

	return applyDashboardCors(req, response);
}
