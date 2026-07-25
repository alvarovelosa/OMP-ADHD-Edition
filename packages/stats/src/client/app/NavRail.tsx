import { BarChart3, History, Settings as SettingsIcon } from "lucide-react";
import { type DashboardRoute, type DashboardSection, isStatsSection } from "./routes";

export interface NavRailProps {
	activeSection: DashboardSection;
	onSectionChange: (section: DashboardSection) => void;
	className?: string;
}

export function NavRail({ activeSection, onSectionChange, className = "" }: NavRailProps) {
	const railItems: { id: string; label: string; icon: DashboardRoute["icon"] }[] = [
		{ id: "sessions", label: "Sessions", icon: History },
		{ id: "stats", label: "Stats", icon: BarChart3 },
		{ id: "settings", label: "Settings", icon: SettingsIcon },
	];

	return (
		<aside className={`stats-nav-rail ${className}`}>
			<div className="stats-nav-rail-header">
				<div className="stats-logo-container">
					<span className="stats-logo-text">OH MY PI</span>
					<span className="stats-logo-subtext">Observability</span>
				</div>
			</div>

			<nav className="stats-nav-rail-menu">
				{railItems.map(item => {
					const isActive = item.id === "stats" ? isStatsSection(activeSection) : item.id === activeSection;
					const Icon = item.icon;
					return (
						<button
							key={item.id}
							type="button"
							onClick={
								item.id === "stats"
									? () => {
											if (!isStatsSection(activeSection)) onSectionChange("overview");
										}
									: () => onSectionChange(item.id as DashboardSection)
							}
							className="stats-nav-rail-item"
							data-active={isActive ? "true" : "false"}
							aria-current={isActive ? "page" : undefined}
						>
							<Icon size={16} className="stats-nav-rail-item-icon" />
							<span className="stats-nav-rail-item-label">{item.label}</span>
						</button>
					);
				})}
			</nav>

			<div className="stats-nav-rail-footer">
				<span className="stats-version-tag">OMP Stats v1.0.0</span>
			</div>
		</aside>
	);
}
