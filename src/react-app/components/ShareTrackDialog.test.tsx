import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createShareUrl } from "../designer/trackCodec";
import { createValidTrackDesign } from "../designer/trackDesign.testSupport";
import { ShareTrackDialog } from "./ShareTrackDialog";

describe("ShareTrackDialog", () => {
	afterEach(cleanup);
	it("falls back to selectable text when sharing APIs reject", async () => {
		const user = userEvent.setup();
		const share = vi.fn().mockRejectedValue(new Error("denied"));
		const track = createValidTrackDesign("Course");
		const expected = createShareUrl(track, "https://example.test/");
		render(<ShareTrackDialog track={track} baseHref="https://example.test/" share={share} writeText={vi.fn()} onImport={vi.fn()} onClose={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: "Share" }));
		expect(screen.getByLabelText("Share link")).toHaveValue(expected.url);
		expect(screen.getByLabelText("Share token")).toHaveValue(expected.token);
		expect(screen.getByRole("status")).toHaveTextContent(/could not share/i);
	});

	it("uses clipboard when native sharing is unavailable", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		const user = userEvent.setup();
		render(<ShareTrackDialog track={createValidTrackDesign()} baseHref="https://example.test/" share={undefined} writeText={writeText} onImport={vi.fn()} onClose={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: "Share" }));
		expect(writeText).toHaveBeenCalledWith(expect.stringContaining("#track="));
	});

	it("emits import input without mutating it", async () => {
		const user = userEvent.setup();
		const onImport = vi.fn();
		render(<ShareTrackDialog track={createValidTrackDesign()} baseHref="https://example.test/" share={undefined} writeText={undefined} onImport={onImport} onClose={vi.fn()} />);
		await user.type(screen.getByLabelText("Import track"), "shared-token");
		await user.click(screen.getByRole("button", { name: "Import" }));
		expect(onImport).toHaveBeenCalledWith("shared-token");
		expect(screen.getByLabelText("Import track")).toHaveValue("shared-token");
	});
});
