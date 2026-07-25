import {
	Activity,
	AlertCircle,
	Coins,
	Cpu,
	Folder,
	History,
	LayoutDashboard,
	Plug,
	Settings as SettingsIcon,
	Smile,
	TrendingUp,
	Wrench,
} from "lucide-react";
import type React from "react";

export type DashboardSection =
	| "overview"
	| "sessions"
	| "requests"
	| "errors"
	| "models"
	| "providers"
	| "tools"
	| "costs"
	| "behavior"
	| "projects"
	| "gain"
	| "settings";

export interface DashboardRoute {
	id: DashboardSection;
	label: string;
	shortLabel?: string;
	icon: React.ComponentType<{ size?: number; className?: string }>;
}

export const routes: DashboardRoute[] = [
	{
		id: "overview",
		label: "Overview",
		icon: LayoutDashboard,
	},
	{
		id: "sessions",
		label: "Sessions",
		icon: History,
	},
	{
		id: "requests",
		label: "Requests",
		icon: Activity,
	},
	{
		id: "errors",
		label: "Errors",
		icon: AlertCircle,
	},
	{
		id: "models",
		label: "Models",
		icon: Cpu,
	},
	{
		id: "providers",
		label: "Providers",
		icon: Plug,
	},
	{
		id: "tools",
		label: "Tools",
		icon: Wrench,
	},
	{
		id: "costs",
		label: "Costs",
		icon: Coins,
	},
	{
		id: "behavior",
		label: "Behavior",
		shortLabel: "Behavior",
		icon: Smile,
	},
	{
		id: "projects",
		label: "Projects",
		icon: Folder,
	},
	{
		id: "gain",
		label: "Gain",
		icon: TrendingUp,
	},
	{
		id: "settings",
		label: "Settings",
		icon: SettingsIcon,
	},
];

export const STATS_SECTIONS: DashboardSection[] = [
	"overview",
	"requests",
	"errors",
	"models",
	"providers",
	"tools",
	"costs",
	"behavior",
	"projects",
	"gain",
];

export function isStatsSection(section: DashboardSection): boolean {
	return (STATS_SECTIONS as string[]).includes(section);
}
