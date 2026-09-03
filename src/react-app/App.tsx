import { useEffect, useRef, useState } from "react";
import { RaceHud } from "./components/RaceHud";
import { ResultsScreen } from "./components/ResultsScreen";
import { SetupScreen, type SetupValues } from "./components/SetupScreen";
import { ShareTrackDialog } from "./components/ShareTrackDialog";
import { TimeoutDialog } from "./components/TimeoutDialog";
import { TrackEditor } from "./components/TrackEditor";
import { createEditorState, type EditorState } from "./designer/editorState";
import { decodeSharedTrack } from "./designer/trackCodec";
import { createDefaultTrackDesign, type LocalTrack, type RaceCourseSelection, type TrackDesign, type TrackLibrary } from "./designer/trackDesign";
import { deleteTrack, loadTrackLibrary, persistTrackLibrary, resetTrackLibrary, upsertTrack } from "./designer/trackLibrary";
import { allocateMarbles, reverseRank } from "./domain/race";
import { createRandom } from "./domain/seed";
import { splitTeams } from "./domain/teams";
import type { Marble, Participant, Team } from "./domain/types";
import type { RaceScene } from "./game/MarbleRaceScene";
import { retroSounds } from "./game/retroSounds";
import "./App.css";

type Session = SetupValues & { marbles: Marble[]; seed: number; course: RaceCourseSelection };
type Hud = { elapsedMs: number; finishedCount: number; leader?: Marble; trailer?: Marble };
type View = "setup" | "editor" | "race" | "results";
const EMPTY_LIBRARY: TrackLibrary = { version: 1, tracks: [] };
const QUICK_PLAY: SetupValues = { mode: "race", prizePool: 0, teamCount: 2, participants: [
	{ id: "player-1", name: "Player 1", color: "#ff4f8f", symbol: "◆" },
	{ id: "player-2", name: "Player 2", color: "#58e7ff", symbol: "●" },
] };

function App() {
	const [view, setView] = useState<View>("setup");
	const [library, setLibrary] = useState<TrackLibrary>(EMPTY_LIBRARY);
	const [selectedTrackId, setSelectedTrackId] = useState<string>();
	const [editor, setEditor] = useState<EditorState>(() => createEditorState(createDefaultTrackDesign()));
	const [shareTrack, setShareTrack] = useState<TrackDesign>();
	const [message, setMessage] = useState("");
	const [libraryError, setLibraryError] = useState(false);
	const [session, setSession] = useState<Session>();
	const [finished, setFinished] = useState<Marble[]>([]);
	const [hud, setHud] = useState<Hud>({ elapsedMs: 0, finishedCount: 0 });
	const [remaining, setRemaining] = useState<Marble[]>();
	const [teams, setTeams] = useState<Team[]>();
	const [paused, setPaused] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const sceneRef = useRef<RaceScene | undefined>(undefined);

	useEffect(() => {
		const loaded = loadTrackLibrary(window.localStorage);
		if (loaded.ok) setLibrary(loaded.library);
		else { setLibraryError(true); setMessage(`Saved tracks could not be loaded: ${loaded.message}`); }
		if (!window.location.hash) return;
		try {
			const imported = decodeSharedTrack(window.location.href);
			setEditor(createEditorState({ name: imported.name, cells: imported.cells }));
			setView("editor"); setMessage("Shared track loaded. Save it to keep it in this browser.");
		} catch (error) { setMessage(error instanceof Error ? error.message : "Shared track could not be loaded."); }
	}, []);

	const trackById = (id: string | undefined): LocalTrack | undefined => library.tracks.find((track) => track.id === id);
	const start = (values: SetupValues, track: TrackDesign | undefined = trackById(selectedTrackId)) => {
		const marbles = values.mode === "race" ? allocateMarbles(values.participants) : values.participants.map((participant, index) => ({ id: index + 1, ownerId: participant.id, color: participant.color, symbol: participant.symbol }));
		retroSounds.start(); setMessage(""); setPaused(false);
		setSession({ ...values, marbles, seed: Date.now(), course: track ? { kind: "custom", track } : { kind: "builtin" } });
		setFinished([]); setTeams(undefined); setRemaining(undefined); setHud({ elapsedMs: 0, finishedCount: 0 }); setView("race");
	};

	useEffect(() => {
		if (view !== "race" || !session || !canvasRef.current) return;
		let active = true; let scene: RaceScene | undefined; let completed = 0;
		void import("./game/MarbleRaceScene").then(({ createRaceScene }) => {
			if (!active || !canvasRef.current) return;
			scene = createRaceScene(canvasRef.current, (event) => {
				if (event.type === "tick") setHud({ elapsedMs: event.elapsedMs, finishedCount: event.finishedCount, leader: event.leader, trailer: event.trailer });
				if (event.type === "timeout") { retroSounds.timeout(); setRemaining(event.remaining); }
				if (event.type === "error") { setMessage(event.message); setView("setup"); }
				if ((event.type === "finish" || event.type === "dnf") && session.mode === "race") {
					completed += 1;
					if (event.type === "finish") setFinished((current) => [...current, event.marble]);
					if (completed === session.marbles.length) { retroSounds.finish(); setView("results"); }
				}
			}, session.course);
			sceneRef.current = scene; scene.start(session.marbles, session.seed);
		}).catch((error: unknown) => { if (active) { setMessage(error instanceof Error ? error.message : "Race could not start."); setView("setup"); } });
		const teamTimer = session.mode === "teams" ? window.setTimeout(() => { setTeams(splitTeams(session.participants, session.teamCount, createRandom(session.seed))); setView("results"); }, 4_500) : undefined;
		return () => { active = false; if (teamTimer) window.clearTimeout(teamTimer); scene?.dispose(); sceneRef.current = undefined; };
	}, [session, view]);

	const importTrack = (input: string) => {
		try { const track = decodeSharedTrack(input); setEditor(createEditorState({ name: track.name, cells: track.cells })); setShareTrack(undefined); setView("editor"); setMessage("Shared track loaded. Save it to keep it."); }
		catch (error) { setMessage(error instanceof Error ? error.message : "Track import failed."); }
	};
	const saveEditor = () => {
		try {
			const saved = upsertTrack(library, editor.draft, { id: editor.id, now: Date.now(), uuid: () => crypto.randomUUID() });
			persistTrackLibrary(window.localStorage, saved.library);
			setLibrary(saved.library); setSelectedTrackId(saved.track.id); setEditor(createEditorState(saved.track, saved.track.id)); setMessage("Track saved in this browser.");
		} catch (error) { setMessage(error instanceof Error ? error.message : "Track could not be saved."); }
	};
	const removeTrack = (id: string) => {
		if (!window.confirm("Delete this track from this browser?")) return;
		try { const next = deleteTrack(library, id); persistTrackLibrary(window.localStorage, next); setLibrary(next); if (selectedTrackId === id) setSelectedTrackId(undefined); }
		catch (error) { setMessage(error instanceof Error ? error.message : "Track could not be deleted."); }
	};
	const editTrack = (id: string) => { const track = trackById(id); if (track) { setEditor(createEditorState(track, id)); setView("editor"); } };
	const openShare = (track: TrackDesign | undefined) => { if (track) setShareTrack(track); };
	const showResults = () => { setRemaining(undefined); setView("results"); };
	const restartAll = () => { if (!session) return; setFinished([]); setRemaining(undefined); setSession({ ...session, seed: Date.now() }); };
	const restartRemaining = () => { if (!remaining) return; setRemaining(undefined); sceneRef.current?.restartRemaining(remaining); };
	const again = () => { setSession(undefined); setFinished([]); setTeams(undefined); setPaused(false); setView("setup"); };
	const participants: Participant[] = session?.participants ?? [];

	return <main className="app-shell">
		{message && <div className="app-message" role="status">{message}{libraryError && <button onClick={() => { const next = resetTrackLibrary(window.localStorage); setLibrary(next); setLibraryError(false); setMessage("Saved track storage reset."); }}>Reset saved tracks</button>}</div>}
		{view === "setup" && <SetupScreen onStart={start} tracks={library.tracks} selectedTrackId={selectedTrackId} onNewTrack={() => { setEditor(createEditorState(createDefaultTrackDesign())); setView("editor"); }} onEditTrack={editTrack} onSelectTrack={setSelectedTrackId} onPlayTrack={(id) => { const track = trackById(id); if (track) start(QUICK_PLAY, track); }} onShareTrack={(id) => openShare(trackById(id))} onDeleteTrack={removeTrack} onImportTrack={importTrack} />}
		{view === "editor" && <TrackEditor state={editor} onChange={setEditor} onBack={() => setView("setup")} onSave={saveEditor} onShare={() => openShare(editor.draft)} onPlay={() => start(QUICK_PLAY, editor.draft)} />}
		{view === "race" && session && <section className="race-stage"><canvas ref={canvasRef} /><RaceHud elapsedMs={hud.elapsedMs} finishedCount={hud.finishedCount} total={session.marbles.length} leader={hud.leader} trailer={hud.trailer} /><div className="race-actions"><button onClick={() => { const next = !paused; setPaused(next); sceneRef.current?.setPaused(next); }}>{paused ? "Resume" : "Pause"}</button><button onClick={again}>Exit</button></div>{remaining && <TimeoutDialog remaining={remaining} onRemaining={restartRemaining} onRestart={restartAll} onResults={showResults} />}</section>}
		{view === "results" && <ResultsScreen rankings={session?.mode === "race" ? reverseRank(finished) : undefined} participants={participants} prizePool={session?.prizePool ?? 0} teams={teams} onAgain={again} />}
		{shareTrack && <ShareTrackDialog track={shareTrack} baseHref={window.location.href} share={navigator.share?.bind(navigator)} writeText={navigator.clipboard?.writeText.bind(navigator.clipboard)} onImport={importTrack} onClose={() => setShareTrack(undefined)} />}
	</main>;
}

export default App;
