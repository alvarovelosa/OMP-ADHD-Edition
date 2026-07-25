export function applyDashboardCors(req: Request, response: Response): Response {
	const origin = req.headers.get("Origin");
	const host = req.headers.get("Host");
	if (origin && host) {
		try {
			const originUrl = new URL(origin);
			if (originUrl.host === host) {
				response.headers.set("Access-Control-Allow-Origin", origin);
			}
		} catch {
			// Ignore invalid origin URL format
		}
	}
	return response;
}
