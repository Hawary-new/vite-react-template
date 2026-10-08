import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

type Variables = {
	requestId: string;
	event: Record<string, unknown>;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", async (c, next) => {
	const requestId = crypto.randomUUID();
	const startedAt = Date.now();
	const event: Record<string, unknown> = {
		event: "http_request",
		request_id: requestId,
		cf_ray: c.req.header("cf-ray"),
		method: c.req.method,
		path: c.req.path,
	};
	c.set("requestId", requestId);
	c.set("event", event);
	c.header("x-request-id", requestId);

	try {
		await next();
		event.status = c.res.status;
		event.outcome =
			c.res.status >= 500
				? "server_error"
				: c.res.status >= 400
					? "client_error"
					: "ok";
	} catch (err) {
		recordError(event, err);
		throw err;
	} finally {
		event.duration_ms = Date.now() - startedAt;
		console.log(JSON.stringify(event));
	}
});

function recordError(event: Record<string, unknown>, err: unknown) {
	event.status = err instanceof HTTPException ? err.status : 500;
	event.outcome = (event.status as number) >= 500 ? "server_error" : "client_error";
	event.error_name = err instanceof Error ? err.name : typeof err;
	event.error_message = err instanceof Error ? err.message : String(err);
	event.error_stack = err instanceof Error ? err.stack : undefined;
}

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

app.onError((err, c) => {
	const event = c.get("event");
	if (event) {
		recordError(event, err);
	}
	if (err instanceof HTTPException) {
		const res = err.getResponse();
		return c.newResponse(res.body, res);
	}
	const requestId = c.get("requestId") ?? crypto.randomUUID();
	return c.json({ error: "Internal Server Error", request_id: requestId }, 500);
});

export default app;
