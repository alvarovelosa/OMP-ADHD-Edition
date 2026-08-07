import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { resetSettingsForTest, Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { getThemeByName, setThemeInstance } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";
import type { SingleResult, TaskToolDetails } from "@oh-my-pi/pi-coding-agent/task";
import { taskToolRenderer } from "@oh-my-pi/pi-coding-agent/task/renderer";

// The reviewer self-reports `file_path`/`line_start`/`line_end` for each
// finding via `yield`; nothing else cross-checks that claim against the diff
// the reviewer was actually handed. `render.ts` re-derives hunk ranges from
// the `<diff>` block embedded in the task assignment and flags a finding
// whose reported position falls outside every hunk for that file, so a
// hallucinated line number is visible in the transcript instead of silently
// trusted.
describe("task renderer: reviewer finding position verification", () => {
	beforeAll(async () => {
		resetSettingsForTest();
		await Settings.init({ inMemory: true, cwd: process.cwd() });
		const theme = await getThemeByName("dark");
		expect(theme).toBeDefined();
		setThemeInstance(theme!);
	});

	afterAll(() => {
		resetSettingsForTest();
	});

	const assignmentWithDiff = [
		"## Code Review Request",
		"",
		"### Diff",
		"",
		"<diff>",
		"diff --git a/src/review.ts b/src/review.ts",
		"index 1111111..2222222 100644",
		"--- a/src/review.ts",
		"+++ b/src/review.ts",
		"@@ -40,2 +40,3 @@ function handle() {",
		" line40",
		"+line41",
		" line42",
		"</diff>",
		"",
	].join("\n");

	function findingYield(lineStart: number, lineEnd: number) {
		return [
			{
				type: ["findings"],
				data: {
					title: "Handle null response",
					body: "Null response reaches the formatter and crashes rendering.",
					priority: 1,
					confidence: 0.8,
					file_path: "src/review.ts",
					line_start: lineStart,
					line_end: lineEnd,
				},
				status: "success",
			},
			{ type: ["overall_correctness"], data: "incorrect", status: "success" },
			{ type: ["explanation"], data: "One bug blocks approval.", status: "success" },
			{ type: ["confidence"], data: 0.8, status: "success" },
		];
	}

	async function renderResultText(assignment: string, lineStart: number, lineEnd: number): Promise<string> {
		const theme = (await getThemeByName("dark"))!;
		const result: SingleResult = {
			index: 0,
			id: "reviewer",
			agent: "reviewer",
			agentSource: "bundled",
			task: "review the patch",
			assignment,
			description: "review the patch",
			exitCode: 0,
			output: "",
			stderr: "",
			truncated: false,
			durationMs: 250,
			tokens: 100,
			requests: 0,
			extractedToolData: { yield: findingYield(lineStart, lineEnd) } as Record<string, unknown[]>,
		};
		const details: TaskToolDetails = {
			projectAgentsDir: null,
			results: [result],
			totalDurationMs: 250,
		};
		const component = taskToolRenderer.renderResult(
			{ content: [{ type: "text", text: "" }], details },
			{ expanded: false, isPartial: false, spinnerFrame: 0 },
			theme,
		);
		return Bun.stripANSI(component.render(160).join("\n"));
	}

	it("does not flag a finding whose line falls inside a diff hunk", async () => {
		const text = await renderResultText(assignmentWithDiff, 41, 41);
		expect(text).toContain("Handle null response");
		expect(text).not.toContain("unverified position");
	});

	it("flags a finding whose line falls outside every hunk for that file", async () => {
		const text = await renderResultText(assignmentWithDiff, 200, 200);
		expect(text).toContain("Handle null response");
		expect(text).toContain("unverified position");
	});

	it("skips verification when the assignment carries no <diff> block (headless/custom modes)", async () => {
		const text = await renderResultText("review the patch", 200, 200);
		expect(text).toContain("Handle null response");
		expect(text).not.toContain("unverified position");
	});
});
