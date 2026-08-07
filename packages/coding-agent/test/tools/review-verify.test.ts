import { describe, expect, it } from "bun:test";
import {
	extractDiffFromAssignment,
	getDiffFileRangesForAssignment,
	parseDiffFileRanges,
	verifyFindingPosition,
} from "@oh-my-pi/pi-coding-agent/tools/review-verify";

const SAMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -10,3 +10,5 @@ function foo() {
 line10
+line11
+line12
 line13
diff --git a/src/bar.ts b/src/bar.ts
index 3333333..4444444 100644
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -1,0 +1,2 @@
+line1
+line2
`;

describe("extractDiffFromAssignment", () => {
	it("pulls the <diff> block out of a rendered review assignment", () => {
		const assignment = `## Code Review Request\n\n### Diff\n\n<diff>\n${SAMPLE_DIFF}</diff>\n`;
		expect(extractDiffFromAssignment(assignment)).toBe(SAMPLE_DIFF.trim());
	});

	it("returns undefined when no <diff> block is present (headless/custom modes)", () => {
		expect(extractDiffFromAssignment("## Code Review Request\n\nHeadless review request\n")).toBeUndefined();
		expect(extractDiffFromAssignment(undefined)).toBeUndefined();
	});
});

describe("parseDiffFileRanges", () => {
	it("maps each file to its new-line hunk ranges", () => {
		const ranges = parseDiffFileRanges(SAMPLE_DIFF);
		expect(ranges.get("src/foo.ts")).toEqual([{ start: 10, end: 14 }]);
		expect(ranges.get("src/bar.ts")).toEqual([{ start: 1, end: 2 }]);
	});
});

describe("verifyFindingPosition", () => {
	const ranges = parseDiffFileRanges(SAMPLE_DIFF);

	it("verifies a finding whose range overlaps a hunk", () => {
		expect(verifyFindingPosition(ranges, { file_path: "src/foo.ts", line_start: 11, line_end: 12 })).toBe("verified");
	});

	it("flags a finding on a line outside every hunk in that file", () => {
		expect(verifyFindingPosition(ranges, { file_path: "src/foo.ts", line_start: 50, line_end: 51 })).toBe(
			"unverified",
		);
	});

	it("flags a finding whose file never appears in the diff", () => {
		expect(verifyFindingPosition(ranges, { file_path: "src/other.ts", line_start: 1, line_end: 1 })).toBe(
			"unverified",
		);
	});
});

describe("getDiffFileRangesForAssignment", () => {
	it("returns undefined when the assignment carries no diff", () => {
		expect(getDiffFileRangesForAssignment("Headless review request")).toBeUndefined();
	});

	it("parses the embedded diff and caches the result for identical assignments", () => {
		const assignment = `### Diff\n\n<diff>\n${SAMPLE_DIFF}</diff>\n`;
		const first = getDiffFileRangesForAssignment(assignment);
		const second = getDiffFileRangesForAssignment(assignment);
		expect(first).toBe(second);
		expect(first?.get("src/foo.ts")).toEqual([{ start: 10, end: 14 }]);
	});
});
