import { useEffect, useRef, useState } from "react";
import { RaceHud } from "./components/RaceHud";
import { ResultsScreen } from "./components/ResultsScreen";
import { SetupScreen, type SetupValues } from "./components/SetupScreen";
import { TimeoutDialog } from "./components/TimeoutDialog";
import { allocateMarbles, reverseRank } from "./domain/race";
import { createRandom } from "./domain/seed";
import { splitTeams } from "./domain/teams";
import type { Marble, Participant, Team } from "./domain/types";
import type { RaceScene } from "./game/MarbleRaceScene";
import { retroSounds } from "./game/retroSounds";
import "./App.css";

type Session = SetupValues & { marbles: Marble[]; seed: number };
type Hud = { elapsedMs: number; finishedCount: number; leader?: Marble; trailer?: Marble };

function App() {
	const [view, setView] = useState<"setup" | "race" | "results">("setup");
	const [session, setSession] = useState<Session>();
	const [finished, setFinished] = useState<Marble[]>([]);
	const [hud, setHud] = useState<Hud>({ elapsedMs: 0, finishedCount: 0 });
	const [remaining, setRemaining] = useState<Marble[]>();
	const [teams, setTeams] = useState<Team[]>();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const sceneRef = useRef<RaceScene | undefined>(undefined);

	const start = (values: SetupValues) => {
		const marbles = values.mode === "race" ? allocateMarbles(values.participants) : values.participants.map((participant, index) => ({ id: index + 1, ownerId: participant.id, color: participant.color, symbol: participant.symbol }));
		retroSounds.start();
		setSession({ ...values, marbles, seed: Date.now() }); setFinished([]); setTeams(undefined); setRemaining(undefined); setHud({ elapsedMs: 0, finishedCount: 0 }); setView("race");
	};

	useEffect(() => {
		if (view !== "race" || !session || !canvasRef.current) return;
		let active = true;
		let scene: RaceScene | undefined;
		void import("./game/MarbleRaceScene").then(({ createRaceScene }) => {
			if (!active || !canvasRef.current) return;
			scene = createRaceScene(canvasRef.current, (event) => {
				if (event.type === "tick") setHud({ elapsedMs: event.elapsedMs, finishedCount: event.finishedCount, leader: event.leader, trailer: event.trailer });
				if (event.type === "timeout") { retroSounds.timeout(); setRemaining(event.remaining); }
				if (event.type === "finish" && session.mode === "race") setFinished((current) => {
					const next = [...current, event.marble];
					if (next.length === session.marbles.length) { retroSounds.finish(); setView("results"); }
					return next;
				});
			});
			sceneRef.current = scene;
			scene.start(session.marbles, session.seed);
		});
		const teamTimer = session.mode === "teams" ? window.setTimeout(() => { setTeams(splitTeams(session.participants, session.teamCount, createRandom(session.seed))); setView("results"); }, 4_500) : undefined;
		return () => { active = false; if (teamTimer) window.clearTimeout(teamTimer); scene?.dispose(); sceneRef.current = undefined; };
	}, [session, view]);

	const showResults = () => { setRemaining(undefined); setView("results"); };
	const restartAll = () => { if (!session) return; setFinished([]); setRemaining(undefined); sceneRef.current?.start(session.marbles, Date.now()); };
	const restartRemaining = () => { if (!remaining) return; setRemaining(undefined); sceneRef.current?.restartRemaining(remaining); };
	const again = () => { setSession(undefined); setFinished([]); setTeams(undefined); setView("setup"); };
	const participants: Participant[] = session?.participants ?? [];

	return <main className="app-shell">{view === "setup" && <SetupScreen onStart={start} />}{view === "race" && session && <section className="race-stage"><canvas ref={canvasRef} /><RaceHud elapsedMs={hud.elapsedMs} finishedCount={hud.finishedCount} total={session.marbles.length} leader={hud.leader} trailer={hud.trailer} />{remaining && <TimeoutDialog remaining={remaining} onRemaining={restartRemaining} onRestart={restartAll} onResults={showResults} />}</section>}{view === "results" && <ResultsScreen rankings={session?.mode === "race" ? reverseRank(finished) : undefined} participants={participants} prizePool={session?.prizePool ?? 0} teams={teams} onAgain={again} />}</main>;
}

export default App;
