import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultsScreen } from "./ResultsScreen";

describe("ResultsScreen", () => {
	afterEach(cleanup);
	it("uses the player Top 3 as the hero and ranking rows without a duplicate winnings list", () => {
		const rankings = ["jin", "lee", "lee", "lee", "lee", "mia", "other"].map((ownerId, index) => ({ id: index + 1, ownerId, color: "#fff", symbol: "◆", rank: index + 1, finishOrder: 7 - index }));
		const participants = ["jin", "lee", "mia", "other"].map((id) => ({ id, name: id, color: "#fff", symbol: "◆" }));
		const { container } = render(<ResultsScreen rankings={rankings} participants={participants} prizePool={100.99} payoutMode="top3" celebrate onReplay={vi.fn()} onBack={vi.fn()} />);
		expect(screen.getByRole("heading", { name: "TOP 3" })).toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: "TOP 10" })).not.toBeInTheDocument();
		expect(container.querySelector(".prize-summary")).not.toBeInTheDocument();
		expect(container.querySelector(".result-hero")).toHaveTextContent("#1 · POINTS LEADER");
		expect(within(container.querySelector<HTMLElement>(".result-hero")!).getByRole("heading", { name: "lee" })).toBeInTheDocument();
		expect(container.querySelector(".result-hero")).toHaveTextContent("110 pts · 70.99");
		const rows = within(screen.getByRole("list")).getAllByRole("listitem");
		expect(rows).toHaveLength(2); expect(rows[0]).toHaveTextContent("#2jin · 100 pts20.00"); expect(rows[1]).toHaveTextContent("#3mia · 5 pts10.00");
		expect(screen.queryByText("other")).not.toBeInTheDocument();
		expect(screen.getByText("TOTAL PRIZE").compareDocumentPosition(screen.getByRole("heading", { name: "TOP 3" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(screen.queryByText(/Most points wins/)).not.toBeInTheDocument();
		expect(screen.queryByText("Top 3 Split")).not.toBeInTheDocument();
	});
	it("keeps the scored Top 3 visible when the pool is zero", () => {
		const { container } = render(<ResultsScreen rankings={[{ id: 1, ownerId: "jin", color: "#fff", symbol: "◆", rank: 1, finishOrder: 1 }]} participants={[{ id: "jin", name: "Jin", color: "#fff", symbol: "◆" }]} prizePool={0} payoutMode="top3" celebrate={false} onReplay={vi.fn()} onBack={vi.fn()} />);
		expect(screen.getByRole("heading", { name: "TOP 3" })).toBeInTheDocument();
		expect(container.querySelector(".result-hero")).toHaveTextContent("#1 · CURRENT POINTS LEADER");
		expect(container.querySelector(".result-hero")).toHaveTextContent("100 pts · 0.00");
		expect(screen.queryAllByRole("listitem")).toHaveLength(0);
	});
	it("highlights the last finisher and offers explicit next actions", async () => {
		const user = userEvent.setup();
		const onReplay = vi.fn(); const onBack = vi.fn();
		const { container } = render(<ResultsScreen rankings={[{ id: 7, ownerId: "jin", color: "#fff", symbol: "◆", rank: 1, finishOrder: 100 }]} participants={[{ id: "jin", name: "Jin", color: "#fff", symbol: "◆" }]} prizePool={0} celebrate onReplay={onReplay} onBack={onBack} />);
		expect(screen.getByRole("heading", { name: "Jin" })).toBeInTheDocument();
		const particles = [...container.querySelectorAll<HTMLElement>(".result-confetti i")];
		const marble = screen.getByRole("img", { name: "Jin's ◆ marble" });
		expect(marble).toHaveStyle({ background: "rgb(255, 255, 255)" });
		expect(marble.compareDocumentPosition(screen.getByRole("heading", { name: "Jin" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(container.querySelector(".prize-board")).not.toBeInTheDocument();
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

	it("places total prize and player winnings before the Top 10 ranking", () => {
		const rankings = [
			{ id: 7, ownerId: "jin", color: "#fff", symbol: "◆", rank: 1, finishOrder: 10 },
			{ id: 8, ownerId: "lee", color: "#0ff", symbol: "●", rank: 2, finishOrder: 9 },
		];
		const { container } = render(<ResultsScreen rankings={rankings} participants={[{ id: "jin", name: "Jin", color: "#fff", symbol: "◆" }, { id: "lee", name: "Lee", color: "#0ff", symbol: "●" }]} prizePool={1_000} celebrate onReplay={vi.fn()} onBack={vi.fn()} />);
		const total = screen.getByText("TOTAL PRIZE"); const winnings = screen.getByRole("heading", { name: "PLAYER WINNINGS" }); const topTen = screen.getByRole("heading", { name: "TOP 10" });
		expect(total.compareDocumentPosition(winnings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(winnings.compareDocumentPosition(topTen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(screen.getByText("1,000.00").closest(".prize-total")).toBeInTheDocument();
		expect(container.querySelector(".prize-summary")).toHaveTextContent("Jin500.00Lee500.00");
	});

	it("labels prize information as current for partial results", () => {
		render(<ResultsScreen rankings={[{ id: 7, ownerId: "jin", color: "#fff", symbol: "◆", rank: 1, finishOrder: 1 }]} participants={[{ id: "jin", name: "Jin", color: "#fff", symbol: "◆" }]} prizePool={1_000} celebrate={false} onReplay={vi.fn()} onBack={vi.fn()} />);
		expect(screen.getByRole("heading", { name: "CURRENT PRIZE SPLIT" })).toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: "PLAYER WINNINGS" })).not.toBeInTheDocument();
	});
});
