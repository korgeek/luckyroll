import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeSharedTrack } from "../designer/trackCodec";
import { createValidTrackDesign } from "../designer/trackDesign.testSupport";
import { ShareTrackDialog } from "./ShareTrackDialog";

describe("ShareTrackDialog", () => {
	afterEach(cleanup);
	it("shows only the portable code and keeps it selectable when copying fails", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn().mockRejectedValue(new Error("denied"));
		const track = createValidTrackDesign("Course");
		render(<ShareTrackDialog track={track} writeText={writeText} onClose={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: "Copy code" }));
		expect(screen.getByLabelText("Track code")).toHaveValue(encodeSharedTrack(track));
		expect(screen.queryByText(/https?:\/\//)).not.toBeInTheDocument();
		expect(screen.getByRole("status")).toHaveTextContent(/select the code and copy it manually/i);
	});

	it("copies the code to the clipboard", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		const user = userEvent.setup();
		const track = createValidTrackDesign();
		render(<ShareTrackDialog track={track} writeText={writeText} onClose={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: "Copy code" }));
		expect(writeText).toHaveBeenCalledWith(encodeSharedTrack(track));
		expect(screen.getByRole("status")).toHaveTextContent("Track code copied.");
	});
});
