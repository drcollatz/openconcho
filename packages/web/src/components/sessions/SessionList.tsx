import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { motion, type Variants } from "framer-motion";
import { ChevronRight, CircleDot, Clock, MessageSquare } from "lucide-react";
import { useSessions } from "@/api/queries";
import type { components } from "@/api/schema.d.ts";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorAlert } from "@/components/shared/ErrorAlert";
import { Pagination } from "@/components/shared/Pagination";
import { Skeleton } from "@/components/shared/Skeleton";
import { SortControl, type SortDir } from "@/components/shared/SortControl";
import { MonoCaption, PageTitle } from "@/components/ui/typography";
import { useDemo } from "@/hooks/useDemo";
import { COLOR } from "@/lib/constants";

type Session = components["schemas"]["Session"];

// Only creation time has a server-side order. Active and ID sorts applied to the
// loaded page only, which hid the workspace-wide extremes, so they are gone.
const SORT_FIELD = "created_at";
const SORT_OPTIONS = [{ value: SORT_FIELD, label: "Newest" }];
const PAGE_SIZE = 20;

const container: Variants = {
	hidden: { opacity: 0 },
	show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item: Variants = {
	hidden: { opacity: 0, y: 10 },
	show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 280, damping: 24 } },
};

export type SessionsSearch = { page: number; sort: SortDir };

// Page and direction live in the URL. Component state would reset when the user
// opens a session and comes back, because the list unmounts in between.
export function validateSessionsSearch(search: Record<string, unknown>): SessionsSearch {
	const page = Number(search.page);
	return {
		page: Number.isInteger(page) && page >= 1 ? page : 1,
		sort: search.sort === "asc" ? "asc" : "desc",
	};
}

export function SessionList() {
	const { mask } = useDemo();
	const { workspaceId } = useParams({ strict: false }) as { workspaceId: string };
	const { page, sort: sortDir } = useSearch({ from: "/workspaces_/$workspaceId_/sessions" });
	const navigate = useNavigate();
	const { data, isLoading, error } = useSessions(workspaceId, page, PAGE_SIZE, sortDir === "desc");

	const sessions: Session[] = (data as { items?: Session[] } | undefined)?.items ?? [];
	const totalPages = (data as { pages?: number } | undefined)?.pages ?? 1;
	const total = (data as { total?: number } | undefined)?.total ?? 0;

	// replace keeps Back from stepping through pages; it returns to the list as last shown.
	function updateSearch(changes: Partial<SessionsSearch>) {
		navigate({
			to: "/workspaces/$workspaceId/sessions" as never,
			params: { workspaceId } as never,
			search: { page, sort: sortDir, ...changes } as never,
			replace: true,
		});
	}

	// Ordering happens on the server (see useSessions), so the rows are shown as received.
	function handleSort(_field: string, dir: SortDir) {
		updateSearch({ sort: dir, page: 1 });
	}

	return (
		<div className="page-container">
			<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
				<Breadcrumb />
				<div className="flex items-center gap-2 mb-1">
					<MessageSquare className="w-5 h-5" style={{ color: COLOR.accent }} strokeWidth={1.5} />
					<PageTitle>Sessions</PageTitle>
					{total > 0 && (
						<span
							className="ml-1 text-xs font-mono px-2 py-0.5 rounded-full"
							style={{
								background: COLOR.accentSubtle,
								color: COLOR.accentText,
								border: `1px solid ${COLOR.accentBorder}`,
							}}
						>
							{total}
						</span>
					)}
					<div className="ml-auto">
						<SortControl
							options={SORT_OPTIONS}
							field={SORT_FIELD}
							dir={sortDir}
							onChange={handleSort}
						/>
					</div>
				</div>
				<MonoCaption className="mt-0.5" as="p">
					{mask(workspaceId)}
				</MonoCaption>
			</motion.div>

			<ErrorAlert error={error instanceof Error ? error : null} />
			{isLoading && <SessionListSkeleton />}

			{!isLoading && sessions.length === 0 && (
				<EmptyState
					icon={MessageSquare}
					title="No sessions found"
					description="No sessions exist in this workspace."
				/>
			)}

			{!isLoading && sessions.length > 0 && (
				<>
					<motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
						{sessions.map((session) => (
							<motion.button
								key={session.id}
								variants={item}
								onClick={() =>
									navigate({
										to: "/workspaces/$workspaceId/sessions/$sessionId",
										params: { workspaceId, sessionId: session.id } as never,
									})
								}
								className="w-full text-left rounded-xl px-5 py-4 group"
								style={{
									background: COLOR.cardBaseBg,
									border: `1px solid ${COLOR.cardBaseBorder}`,
								}}
								whileHover={{
									background: COLOR.accentDimHover,
									borderColor: COLOR.accentBorder,
									x: 2,
								}}
							>
								<div className="flex items-center justify-between">
									<span
										className="font-mono text-sm font-medium truncate"
										style={{ color: COLOR.accentSoft }}
									>
										{mask(session.id)}
									</span>
									<div className="flex items-center gap-2 shrink-0 ml-2">
										{session.is_active && (
											<div className="flex items-center gap-1">
												<motion.div
													animate={{ opacity: [0.5, 1, 0.5] }}
													transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
												>
													<CircleDot
														className="w-3 h-3"
														style={{ color: COLOR.success }}
														strokeWidth={2}
													/>
												</motion.div>
												<span className="text-xs" style={{ color: COLOR.success }}>
													Active
												</span>
											</div>
										)}
										<ChevronRight
											className="w-4 h-4 opacity-30 group-hover:opacity-70 transition-opacity"
											style={{ color: COLOR.accent }}
											strokeWidth={1.5}
										/>
									</div>
								</div>
								<div className="flex items-center gap-2 mt-2">
									{session.created_at && (
										<div className="flex items-center gap-1.5">
											<Clock
												className="w-3 h-3"
												style={{ color: COLOR.dimIcon }}
												strokeWidth={1.5}
											/>
											<MonoCaption>{new Date(session.created_at).toLocaleString()}</MonoCaption>
										</div>
									)}
									{(session.metadata as Record<string, string> | null)?.source && (
										<span
											className="text-xs font-mono px-1.5 py-0.5 rounded"
											style={{
												background: COLOR.accentDim,
												border: `1px solid ${COLOR.accentBorderStrong}`,
												color: COLOR.dimText,
											}}
										>
											{mask((session.metadata as Record<string, string>).source)}
										</span>
									)}
								</div>
							</motion.button>
						))}
					</motion.div>
					<Pagination
						page={page}
						totalPages={totalPages}
						onPageChange={(next) => updateSearch({ page: next })}
					/>
				</>
			)}
		</div>
	);
}

function SessionListSkeleton() {
	return (
		<div aria-hidden="true">
			<div className="space-y-2">
				{Array.from({ length: 5 }).map((_, index) => (
					<div
						key={index}
						className="rounded-xl px-5 py-4"
						style={{
							background: COLOR.cardBaseBg,
							border: `1px solid ${COLOR.cardBaseBorder}`,
						}}
					>
						<div className="flex items-center justify-between">
							<Skeleton accent className="h-4 w-44 rounded" />
							<div className="flex items-center gap-2">
								{index % 2 === 0 && <Skeleton className="h-4 w-12 rounded-full" />}
								<Skeleton className="h-4 w-4 rounded" />
							</div>
						</div>
						<div className="mt-3 flex items-center gap-2">
							<Skeleton className="h-3 w-3 rounded-full" />
							<Skeleton className="h-3 w-28 rounded" />
							<Skeleton className="h-5 w-16 rounded-md" />
						</div>
					</div>
				))}
			</div>
			<div className="mt-4 flex items-center justify-between">
				<Skeleton className="h-8 w-20 rounded-lg" />
				<Skeleton className="h-4 w-16 rounded" />
				<Skeleton className="h-8 w-20 rounded-lg" />
			</div>
		</div>
	);
}
