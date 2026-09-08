import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultsScreen } from "./ResultsScreen";

describe("ResultsScreen", () => {
	afterEach(cleanup);
	it("highlights the last finisher and offers explicit next actions", async () => {
		const user = userEvent.setup();
		const onReplay = vi.fn(); const onBack = vi.fn();
		const { container } = render(<ResultsScreen rankings={[{ id: 7, ownerId: "jin", color: "#fff", symbol: "◆", rank: 1, finishOrder: 100 }]} participants={[{ id: "jin", name: "Jin", color: "#fff", symbol: "◆" }]} prizePool={0} celebrate onReplay={onReplay} onBack={onBack} />);
		expect(screen.getByRole("heading", { name: "Jin" })).toBeInTheDocument();
		const particles = [...container.querySelectorAll<HTMLElement>(".result-confetti i")];
		expect(particles.length).toBeGreaterThanOrEqual(250);
		const spreadX = particles.map((particle) => Number.parseFloat(particle.style.getPropertyValue("--burst-x")));
		const spreadY = particles.map((particle) => Number.parseFloat(particle.style.getPropertyValue("--burst-y")));
		expect(Math.min(...spreadX)).toBeLessThan(-45);
		expect(Math.max(...spreadX)).toBeGreaterThan(45);
		expect(Math.min(...spreadY)).toBeLessThan(-45);
		expect(Math.max(...spreadY)).toBeGreaterThan(25);
		for (const particle of particles) {
			expect(particle.style.getPropertyValue("--burst-x")).toMatch(/vw$/);
			expect(particle.style.getPropertyValue("--burst-y")).toMatch(/svh$/);
			expect(Number.parseFloat(particle.style.animationDuration)).toBeGreaterThanOrEqual(6);
		}
		await user.click(screen.getByRole("button", { name: "Replay same settings" }));
		await user.click(screen.getByRole("button", { name: "Back to Menu" }));
		expect(onReplay).toHaveBeenCalledOnce();
		expect(onBack).toHaveBeenCalledOnce();
	});

	it("does not render celebration particles for partial results", () => {
		const { container } = render(<ResultsScreen rankings={[{ id: 7, ownerId: "jin", color: "#fff", symbol: "◆", rank: 1, finishOrder: 1 }]} participants={[{ id: "jin", name: "Jin", color: "#fff", symbol: "◆" }]} prizePool={0} celebrate={false} onReplay={vi.fn()} onBack={vi.fn()} />);
		expect(container.querySelector(".result-confetti")).not.toBeInTheDocument();
		expect(screen.getByText("LATEST FINISHER · PARTIAL RESULTS")).toBeInTheDocument();
	});
});
