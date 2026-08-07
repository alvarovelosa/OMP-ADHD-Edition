/**
 * Deterministic position verification for reviewer findings.
 *
 * Reviewer subagents self-report `file_path`/`line_start`/`line_end` for each
 * finding via `yield` — nothing cross-checks that the claimed location is
 * actually inside the diff the reviewer was handed. This module re-derives
 * the set of new-file line ranges touched by each hunk directly from the
 * unified diff embedded in the reviewer's task assignment (the `<diff>...
 * </diff>` block rendered by `review-request.md`), so the render path can
 * flag findings whose position doesn't overlap any hunk without trusting the
 * model's own claim.
 *
 * Verification is best-effort and additive: when no `<diff>` block is present
 * (custom/headless review modes, or the large-diff preview path, which is
 * deliberately truncated and would produce false "unverified" flags) callers
 * get `undefined` and render nothing extra.
 */

/** Inclusive new-file line range covered by one diff hunk. */
export interface DiffLineRange {
	start: number;
	end: number;
}

/** Per-file hunk ranges, keyed by repo-relative path with `a/`/`b/` prefixes stripped. */
export type DiffFileRanges = ReadonlyMap<string, DiffLineRange[]>;

export type FindingPositionStatus = "verified" | "unverified";

const DIFF_TAG_RE = /<diff>\n?([\s\S]*?)\n?<\/diff>/;
const FILE_HEADER_RE = /^\+\+\+ (?:b\/)?(.+)$/;
const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

function normalizePath(rawPath: string): string {
	return rawPath
		.trim()
		.replace(/\\/g, "/")
		.replace(/^["']|["']$/g, "");
}

/** Extract the raw unified diff embedded in a reviewer task assignment, if any. */
export function extractDiffFromAssignment(assignment: string | undefined): string | undefined {
	if (!assignment) return undefined;
	const match = DIFF_TAG_RE.exec(assignment);
	const diffText = match?.[1]?.trim();
	return diffText ? diffText : undefined;
}

/** Parse a unified diff into per-file new-line hunk ranges. */
export function parseDiffFileRanges(diffText: string): DiffFileRanges {
	const ranges = new Map<string, DiffLineRange[]>();
	let currentFile: string | undefined;

	for (const rawLine of diffText.split("\n")) {
		const fileMatch = FILE_HEADER_RE.exec(rawLine);
		if (fileMatch) {
			currentFile = fileMatch[1] === "/dev/null" ? undefined : normalizePath(fileMatch[1]);
			continue;
		}

		const hunkMatch = currentFile ? HUNK_HEADER_RE.exec(rawLine) : null;
		if (hunkMatch) {
			const newStart = Number(hunkMatch[1]);
			const newCount = hunkMatch[2] !== undefined ? Number(hunkMatch[2]) : 1;
			const end = newCount > 0 ? newStart + newCount - 1 : newStart;
			const list = ranges.get(currentFile as string);
			if (list) list.push({ start: newStart, end });
			else ranges.set(currentFile as string, [{ start: newStart, end }]);
		}
	}

	return ranges;
}

const DIFF_RANGES_CACHE_LIMIT = 16;
const diffRangesCache = new Map<string, DiffFileRanges>();

/** Cached `extractDiffFromAssignment` + `parseDiffFileRanges`, keyed by assignment text. */
export function getDiffFileRangesForAssignment(assignment: string | undefined): DiffFileRanges | undefined {
	const diffText = extractDiffFromAssignment(assignment);
	if (!diffText) return undefined;

	const cached = diffRangesCache.get(diffText);
	if (cached) return cached;

	const parsed = parseDiffFileRanges(diffText);
	diffRangesCache.set(diffText, parsed);
	if (diffRangesCache.size > DIFF_RANGES_CACHE_LIMIT) {
		const oldestKey = diffRangesCache.keys().next().value;
		if (oldestKey !== undefined) diffRangesCache.delete(oldestKey);
	}
	return parsed;
}

/**
 * Check whether a finding's claimed location overlaps a hunk in `ranges`.
 * A finding whose file never appears in the diff, or whose line range falls
 * entirely outside every hunk for that file, is "unverified".
 */
export function verifyFindingPosition(
	ranges: DiffFileRanges,
	finding: { file_path: string; line_start: number; line_end: number },
): FindingPositionStatus {
	const fileRanges = ranges.get(normalizePath(finding.file_path ?? ""));
	if (!fileRanges || fileRanges.length === 0) return "unverified";

	const lo = Math.min(finding.line_start, finding.line_end);
	const hi = Math.max(finding.line_start, finding.line_end);
	for (const range of fileRanges) {
		if (lo <= range.end && hi >= range.start) return "verified";
	}
	return "unverified";
}
