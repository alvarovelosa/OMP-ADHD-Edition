import { describe, expect, it } from "bun:test";
import * as stats from "@oh-my-pi/omp-stats";
import { Settings, settings } from "../src/config/settings";
import { handleSettingsApiRequest } from "../src/config/settings-http-api";

describe("settings-http-api", () => {
	it("handles settings tabs, tab details, value updates, and CORS rules", async () => {
		await Settings.init();

		const server = await stats.startServer(3988, { apiHandler: handleSettingsApiRequest });
		const port = server.port;

		try {
			// GET /api/settings/tabs
			const resTabs = await fetch(`http://localhost:${port}/api/settings/tabs`);
			expect(resTabs.status).toBe(200);
			const tabs = (await resTabs.json()) as Array<{ id: string }>;
			expect(Array.isArray(tabs)).toBe(true);
			expect(tabs.length).toBe(10);
			expect(tabs[0].id).toBe("appearance");

			// CORS check: wildcard omitted for /api/settings/* unless origin matches
			expect(resTabs.headers.get("access-control-allow-origin")).toBeNull();

			// CORS check with matching origin
			const resTabsCors = await fetch(`http://localhost:${port}/api/settings/tabs`, {
				headers: { Origin: `http://localhost:${port}`, Host: `localhost:${port}` },
			});
			expect(resTabsCors.headers.get("access-control-allow-origin")).toBe(`http://localhost:${port}`);

			// GET /api/settings/tab/appearance
			const resAppearance = await fetch(`http://localhost:${port}/api/settings/tab/appearance`);
			expect(resAppearance.status).toBe(200);
			const appData = (await resAppearance.json()) as {
				id: string;
				groups: string[];
				fields: Array<{ path: string; options?: Array<{ value: string }> }>;
			};
			expect(appData.id).toBe("appearance");
			expect(appData.groups).toEqual(["Theme", "Status Line", "Display", "Images"]);
			const themeDark = appData.fields.find(f => f.path === "theme.dark");
			expect(themeDark).toBeDefined();
			expect(themeDark?.options?.length).toBeGreaterThan(0);

			// POST /api/settings/value (valid)
			const origVal = settings.get("statusLine.sessionAccent");
			const resVal = await fetch(`http://localhost:${port}/api/settings/value`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: "statusLine.sessionAccent", value: !origVal }),
			});
			expect(resVal.status).toBe(200);
			const valData = (await resVal.json()) as { changed: boolean; value: unknown };
			expect(valData.changed).toBe(true);
			expect(valData.value).toBe(!origVal);

			// POST /api/settings/reset
			const resReset = await fetch(`http://localhost:${port}/api/settings/reset`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: "statusLine.sessionAccent" }),
			});
			expect(resReset.status).toBe(200);
			const resetData = (await resReset.json()) as { changed: boolean };
			expect(resetData.changed).toBe(false);

			// POST /api/settings/value (invalid)
			const resInvalid = await fetch(`http://localhost:${port}/api/settings/value`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: "symbolPreset", value: "invalid-preset-name" }),
			});
			expect(resInvalid.status).toBe(400);
		} finally {
			server.stop();
		}
	});
});
