import { handleSessionsApiRequest } from "../session/sessions-http-api";
import { handleSettingsApiRequest } from "./settings-http-api";

export async function handleDashboardApiRequest(req: Request): Promise<Response> {
	const pathname = new URL(req.url).pathname;
	if (pathname.startsWith("/api/settings/")) return handleSettingsApiRequest(req);
	if (pathname.startsWith("/api/sessions/")) return handleSessionsApiRequest(req);
	return new Response("Not Found", { status: 404 });
}
