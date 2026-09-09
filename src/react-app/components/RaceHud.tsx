import { reverseRank, topPlayerScores, type PayoutMode } from "../domain/race";
import type { Marble, Participant } from "../domain/types";
import type { LiveStanding } from "../game/MarbleRaceScene";


export function RaceHud({ elapsedMs, fps, eliminatedCount, total, standings, finished, participants, payoutMode = "winner" }: { elapsedMs: number; fps: number; eliminatedCount: number; total: number; standings: readonly LiveStanding[]; finished: readonly Marble[]; participants: readonly Participant[]; payoutMode?: PayoutMode }) {
	const finishedIds = new Set(finished.map((marble) => marble.id));
	const active = standings.filter(({ marble }) => !finishedIds.has(marble.id));
	const firstGap = active[0]?.gap ?? 0;
	const rows = [
		...active.map(({ marble, gap }) => ({ marble, gap: Math.max(0, gap - firstGap), finished: false })),
		...reverseRank(finished).map((marble) => ({ marble, gap: undefined, finished: true })),
	].slice(0, 10);
	const scores = payoutMode === "top3" ? topPlayerScores(rows.map(({ marble }, index) => ({ ...marble, rank: index + 1, finishOrder: 0 }))).slice(0, 3) : null;
	return <div className="race-hud">
		<div className="hud-top"><div><strong>LUCKY ROLL</strong><small className="hud-fps">{fps > 0 ? `${Math.round(fps)} FPS` : "FPS —"}</small></div><b>{(elapsedMs / 1000).toFixed(1)}s</b></div>
		<section className="live-standings" aria-label={scores ? "Live provisional player points" : "Live reverse standings"}>
			<strong>{scores ? <>LIVE · POINTS · TOP 3<br /><span>PROVISIONAL</span></> : <>LIVE · LAST WINS · <span className="standings-desktop-title">TOP 10</span><span className="standings-phone-title">TOP 5</span></>}</strong>
			<ol style={scores ? { height: 66 } : undefined}>{scores ? scores.map(({ ownerId, points }, index) => {
				const participant = participants.find((entry) => entry.id === ownerId);
				return <li key={ownerId} style={{ transform: `translateY(${index * 22}px)` }}><b>{index + 1}</b><i style={{ background: participant?.color }} /><span>{participant?.name ?? "Unknown"}</span><small>{points} PTS</small></li>;
			}) : rows.map(({ marble, gap, finished: isFinished }, index) => <li key={marble.id} className={isFinished ? "finished" : undefined} style={{ transform: `translateY(${index * 22}px)` }}><b>{index + 1}</b><i style={{ background: marble.color }} /><span>{participants.find((participant) => participant.id === marble.ownerId)?.name ?? "Unknown"} · #{marble.id}</span><small>{isFinished ? "FIN" : index === 0 ? "WINNING" : `+${gap?.toFixed(1)}u`}</small></li>)}</ol>
		</section>
		<div className="hud-bottom"><span>DONE {finished.length}/{total}</span><span>OUT {eliminatedCount}</span></div>
	</div>;
}
