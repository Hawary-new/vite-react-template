import { Hono } from "hono";

type Variables = {
	requestId: string;
	requestStart: number;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Emit one structured event per request (Workers Logs parses a single JSON line).
// The event carries a request id, route context, outcome, duration and, on
// failure, the error object itself, so an operator can query which requests
// failed or slowed down and correlate a response with its log line instead of
// seeing only aggregate request metrics.
app.use("*", async (c, next) => {
	const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
	c.set("requestId", requestId);
	c.set("requestStart", Date.now());
	c.header("x-request-id", requestId);

	await next();

	const status = c.res.status;
	const error = c.error;
	console.log(
		JSON.stringify({
			message: "request",
			requestId,
			method: c.req.method,
			path: c.req.path,
			status,
			outcome: status >= 500 ? "error" : status >= 400 ? "client_error" : "success",
			durationMs: Date.now() - c.get("requestStart"),
			...(error ? { error: { name: error.name, message: error.message, stack: error.stack } } : {}),
		}),
	);
});

// Turning a thrown handler into a response here is what lets the event above
// emit on the failure path too (the router catches the error and returns here,
// populating `c.error`); the body stays a JSON 500 instead of the runtime default.
app.onError((_err, c) => c.json({ error: "Internal Server Error" }, 500));

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

export default app;
