import type { CSSProperties } from "react";
import { formatMoney, PAYOUT_MODES, prizeByOwner, topPlayerScores, type PayoutMode } from "../domain/race";
import type { Participant, RankedMarble } from "../domain/types";

export function ResultsScreen({ rankings, participants, prizePool, payoutMode = "equal", celebrate, onReplay, onBack }: { rankings: RankedMarble[]; participants: Participant[]; prizePool: number; payoutMode?: PayoutMode; celebrate: boolean; onReplay: () => void; onBack: () => void }) {
	const prizes = prizeByOwner(rankings, prizePool, payoutMode, participants);
	const scores = payoutMode === "top3" ? topPlayerScores(rankings).slice(0, 3) : [];
	const prizeRows: [string, number][] = payoutMode === "top3" ? scores.map(({ ownerId }) => [ownerId, prizes[ownerId] ?? 0]) : Object.entries(prizes).filter(([, amount]) => amount > 0);
	const winner = rankings[0];
	const winnerName = participants.find((person) => person.id === winner?.ownerId)?.name;
	return <section className="results-card">
		{celebrate && <div className="result-confetti" aria-hidden="true">{Array.from({ length: 300 }, (_, index) => {
			const angle = index * 2.399963; // Golden angle spreads successive pieces around the whole burst.
			const radius = .45 + ((index * 37) % 101) / 100 * .55;
			return <i key={index} style={{
				background: ["#ff4f8f", "#58e7ff", "#ffcf58", "#a883ff", "#6dffae", "#fff4cc"][index % 6],
				borderRadius: index % 4 === 0 ? "50%" : "2px",
				animationDelay: `${Math.floor(index / 100) * 180 + index % 7 * 12}ms`,
				animationDuration: `${6 + index % 7 * .16}s`,
				"--burst-x": `${Math.cos(angle) * radius * 58}vw`,
				"--burst-y": `${Math.sin(angle) * radius * 52 - 10}svh`,
				"--size": .75 + index % 5 * .16,
				"--spin": `${(index % 2 ? -1 : 1) * (720 + index % 7 * 180)}deg`,
			} as CSSProperties} />;
		})}</div>}
		<p className="eyebrow">WHO WAS LAST?</p>
		{(prizePool > 0 || payoutMode === "top3") && <section className="prize-board"><p className="prize-total"><span>{celebrate ? "TOTAL PRIZE" : "CURRENT PRIZE"}</span><strong>{formatMoney(prizePool)}</strong></p><p className="payout-note">{PAYOUT_MODES.find(({ id }) => id === payoutMode)?.label}</p>{payoutMode === "top3" && <p className="payout-note">Last 10 marbles: 10 points for the last finisher down to 1 point for #10. Player totals decide the Top 3; ties favor the best marble rank. Prizes split 5:3:1 (5:3 for two players); remainders go to the points leader.</p>}<section className="prize-winnings"><h2>{celebrate ? "PLAYER WINNINGS" : "CURRENT PRIZE SPLIT"}</h2><div className="prize-summary">{prizeRows.map(([owner, amount], index) => <p key={owner}><span>{payoutMode === "top3" && `#${index + 1} `}{participants.find((person) => person.id === owner)?.name}{payoutMode === "top3" && ` · ${scores[index].points} pts`}</span><strong>{formatMoney(amount)}</strong></p>)}</div></section></section>}
		<h1>TOP 10</h1>
		{winner && <article className="result-hero"><span>{celebrate ? "#1 · LAST FINISHER" : "LATEST FINISHER · PARTIAL RESULTS"}</span><div className="winner-name"><i className="winner-marble" role="img" aria-label={`${winnerName}'s ${winner.symbol} marble`} style={{ background: winner.color }}>{winner.symbol}</i><h2>{winnerName}</h2></div><p>Marble #{winner.id}</p></article>}
		<ol className="ranking-list">{rankings.slice(1, 10).map((marble) => <li key={marble.id}><b>#{marble.rank}</b><span style={{ color: marble.color }}>{marble.symbol} #{marble.id}</span><strong>{participants.find((person) => person.id === marble.ownerId)?.name}</strong></li>)}</ol>
		<div className="result-actions"><button className="primary-button" onClick={onReplay}>Replay same settings</button><button className="secondary-button" onClick={onBack}>Back to Menu</button></div>
		<p className="audio-credit">Music: <a href="https://opengameart.org/content/level-finish-fanfares" target="_blank" rel="noreferrer">Level finish fanfares</a> · Johan Brodd, 2014 · <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a></p>
	</section>;
}
