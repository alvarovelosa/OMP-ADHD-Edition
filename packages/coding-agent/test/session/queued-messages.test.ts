import { describe, expect, it } from "bun:test";
import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import {
	IMAGE_ATTACHMENT_DESCRIPTION_FAILED_TYPE,
	IMAGE_ATTACHMENT_DESCRIPTION_TYPE,
	isDisplayableQueuedMessage,
	isHiddenUserCompanion,
	isUserQueuedMessage,
} from "@oh-my-pi/pi-coding-agent/session/queued-messages";

function visionCompanion(customType: string, display: boolean, attribution: "user" | "agent" = "user"): AgentMessage {
	return {
		role: "custom",
		customType,
		content: [{ type: "text", text: '<image path="local://cat.png">a cat</image>' }],
		attribution,
		display,
		timestamp: 1,
	};
}

describe("queued vision-description companions", () => {
	it("stay tied to the adjacent user prompt when popped, regardless of display", () => {
		// display:true so the description renders in the transcript, but it must
		// remain a hidden companion of the user prompt in the queue UI.
		for (const customType of [IMAGE_ATTACHMENT_DESCRIPTION_TYPE, IMAGE_ATTACHMENT_DESCRIPTION_FAILED_TYPE]) {
			expect(isHiddenUserCompanion(visionCompanion(customType, true))).toBe(true);
			expect(isHiddenUserCompanion(visionCompanion(customType, false))).toBe(true);
		}
	});

	it("never render as queue chips or restore to the editor, regardless of display", () => {
		for (const customType of [IMAGE_ATTACHMENT_DESCRIPTION_TYPE, IMAGE_ATTACHMENT_DESCRIPTION_FAILED_TYPE]) {
			expect(isDisplayableQueuedMessage(visionCompanion(customType, true))).toBe(false);
			expect(isUserQueuedMessage(visionCompanion(customType, true))).toBe(false);
			expect(isDisplayableQueuedMessage(visionCompanion(customType, false))).toBe(false);
			expect(isUserQueuedMessage(visionCompanion(customType, false))).toBe(false);
		}
	});

	it("are not companions when not user-attributed", () => {
		expect(isHiddenUserCompanion(visionCompanion(IMAGE_ATTACHMENT_DESCRIPTION_TYPE, true, "agent"))).toBe(false);
	});

	it("leave unrelated user-attributed custom messages displayable and restorable", () => {
		const ordinary = visionCompanion("some-extension-message", true);
		expect(isDisplayableQueuedMessage(ordinary)).toBe(true);
		expect(isUserQueuedMessage(ordinary)).toBe(true);
		expect(isHiddenUserCompanion(ordinary)).toBe(false);
	});

	it("keep magic-keyword notices hidden only while display:false", () => {
		const notice = visionCompanion("ultrathink-notice", false);
		expect(isHiddenUserCompanion(notice)).toBe(true);
		expect(isDisplayableQueuedMessage(notice)).toBe(false);
		expect(isUserQueuedMessage(notice)).toBe(false);
		expect(isHiddenUserCompanion(visionCompanion("ultrathink-notice", true))).toBe(false);
	});
});
