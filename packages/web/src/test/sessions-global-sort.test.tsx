import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoProvider } from "@/context/DemoContext";
import { MetadataProvider } from "@/context/MetadataContext";
import { saveStore } from "@/lib/config";
import { routeTree } from "@/routeTree.gen";

const { httpFetch } = vi.hoisted(() => ({ httpFetch: vi.fn() }));
vi.mock("@/lib/http", () => ({ httpFetch }));

const WORKSPACE_ID = "ws-alpha";
const TOTAL_SESSIONS = 45;
const INSTANCE = {
	id: "inst-1",
	name: "Local",
	baseUrl: "http://localhost:8000",
	token: "secret-token",
};

// Session i is created on day i, so sess-00 is the oldest and sess-44 the newest.
const SESSIONS = Array.from({ length: TOTAL_SESSIONS }, (_, i) => ({
	id: `sess-${String(i).padStart(2, "0")}`,
	created_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
	is_active: false,
	metadata: {},
}));

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

// Mirrors Honcho: pages are cut from the full list in created_at order, ascending
// by default and descending when `reverse=true`.
function sessionsPage(url: URL) {
	const page = Number(url.searchParams.get("page") ?? "1");
	const size = Number(url.searchParams.get("size") ?? "20");
	const reverse = url.searchParams.get("reverse") === "true";
	const ordered = reverse ? [...SESSIONS].reverse() : SESSIONS;
	return json({
		items: ordered.slice((page - 1) * size, page * size),
		total: TOTAL_SESSIONS,
		page,
		size,
		pages: Math.ceil(TOTAL_SESSIONS / size),
	});
}

function mockHoncho() {
	httpFetch.mockImplementation(async (input: Request | string, init?: RequestInit) => {
		const req = typeof input === "string" ? new Request(input, init) : input;
		const url = new URL(req.url);
		if (url.pathname.endsWith("/sessions/list")) {
			return sessionsPage(url);
		}
		return json({ items: [], total: 0, page: 1, size: 20, pages: 1 });
	});
}

function sessionListRequests(): URLSearchParams[] {
	const requests = httpFetch.mock.calls.map((call: unknown[]) => {
		const [input, init] = call as [Request | string, RequestInit | undefined];
		return typeof input === "string" ? new Request(input, init) : input;
	});
	return requests
		.map((req: Request) => new URL(req.url))
		.filter((url) => url.pathname.endsWith("/sessions/list"))
		.map((url) => url.searchParams);
}

function renderSessions(initialPath = `/workspaces/${WORKSPACE_ID}/sessions`) {
	saveStore({ instances: [INSTANCE], activeId: INSTANCE.id });
	const router = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [initialPath] }),
	});
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	const view = render(
		<QueryClientProvider client={qc}>
			<DemoProvider>
				<MetadataProvider>
					{/* biome-ignore lint/suspicious/noExplicitAny: test router type */}
					<RouterProvider router={router as any} />
				</MetadataProvider>
			</DemoProvider>
		</QueryClientProvider>,
	);
	return { ...view, router };
}

async function renderedSessionIds(): Promise<string[]> {
	const buttons = await screen.findAllByRole("button", { name: /^sess-\d+/ });
	// The first span of each card holds only the session id.
	return buttons.map((button) => button.querySelector("span")?.textContent ?? "");
}

describe("sessions list global ordering", () => {
	afterEach(() => {
		httpFetch.mockReset();
		localStorage.clear();
	});

	it("asks the server for newest first and shows the globally newest session on page 1", async () => {
		mockHoncho();
		renderSessions();

		const ids = await renderedSessionIds();
		expect(ids[0]).toBe("sess-44");
		expect(ids).toHaveLength(20);

		const params = sessionListRequests();
		expect(params.at(-1)?.get("reverse")).toBe("true");
		expect(params.at(-1)?.get("page")).toBe("1");
		expect(params.at(-1)?.get("size")).toBe("20");
	});

	it("re-requests page 1 in oldest-first order when the direction is toggled", async () => {
		mockHoncho();
		renderSessions();
		await renderedSessionIds();

		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: /newest/i }));

		await waitFor(() => {
			const first = screen.getAllByRole("button", { name: /^sess-\d+/ })[0];
			expect(first).toHaveTextContent("sess-00");
		});
		const params = sessionListRequests();
		expect(params.at(-1)?.get("reverse")).toBe("false");
		expect(params.at(-1)?.get("page")).toBe("1");
	});

	it("keeps direction and page when a session is opened and Back is pressed", async () => {
		mockHoncho();
		const { router } = renderSessions(`/workspaces/${WORKSPACE_ID}/sessions?sort=asc&page=2`);
		expect((await renderedSessionIds())[0]).toBe("sess-20");

		await router.navigate({
			to: "/workspaces/$workspaceId/sessions/$sessionId",
			params: { workspaceId: WORKSPACE_ID, sessionId: "sess-20" },
		});
		await router.history.back();

		await waitFor(() => {
			expect((router.state.location.search as Record<string, unknown>).sort).toBe("asc");
			expect(screen.getAllByRole("button", { name: /^sess-\d+/ })[0]).toHaveTextContent("sess-20");
		});
		const params = sessionListRequests();
		expect(params.at(-1)?.get("reverse")).toBe("false");
		expect(params.at(-1)?.get("page")).toBe("2");
	});
});
