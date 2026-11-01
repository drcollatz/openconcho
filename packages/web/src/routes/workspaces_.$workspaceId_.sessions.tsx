import { createFileRoute } from "@tanstack/react-router";
import { SessionList, validateSessionsSearch } from "@/components/sessions/SessionList";

export const Route = createFileRoute("/workspaces_/$workspaceId_/sessions")({
	validateSearch: validateSessionsSearch,
	component: SessionList,
});
