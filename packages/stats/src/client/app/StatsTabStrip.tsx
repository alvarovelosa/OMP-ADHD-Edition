import { type DashboardSection, routes, STATS_SECTIONS } from "./routes";

export interface StatsTabStripProps {
	activeSection: DashboardSection;
	onSelect: (section: DashboardSection) => void;
}

export function StatsTabStrip({ activeSection, onSelect }: StatsTabStripProps) {
	return (
		<div className="stats-settings-tab-strip">
			{STATS_SECTIONS.map(id => {
				const route = routes.find(r => r.id === id);
				if (!route) return null;
				const isActive = id === activeSection;
				return (
					<button
						key={id}
						type="button"
						onClick={() => onSelect(id)}
						className={`stats-settings-tab-btn${isActive ? " is-active" : ""}`}
					>
						{route.label}
					</button>
				);
			})}
		</div>
	);
}
