import { type CSSProperties, type MouseEvent, useEffect, useRef, useState } from "react";
import { RaceHud } from "./components/RaceHud";
import { ResultsScreen } from "./components/ResultsScreen";
import { SetupScreen, type SetupValues } from "./components/SetupScreen";
import { ShareTrackDialog } from "./components/ShareTrackDialog";
import { TimeoutDialog } from "./components/TimeoutDialog";
import { TrackEditor } from "./components/TrackEditor";
import { TrackLibraryPanel } from "./components/TrackLibraryPanel";
import { createEditorState, type EditorState } from "./designer/editorState";
import { decodeSharedTrack } from "./designer/trackCodec";
import { createDefaultTrackDesign, type LocalTrack, type RaceCourseSelection, type TrackDesign, type TrackLibrary } from "./designer/trackDesign";
import { deleteTrack, loadTrackLibrary, persistTrackLibrary, resetTrackLibrary, upsertTrack } from "./designer/trackLibrary";
import { allocateMarbles, reverseRank } from "./domain/race";
import type { Marble, Participant } from "./domain/types";
import type { LiveStanding, RaceScene } from "./game/MarbleRaceScene";
import { retroSounds } from "./game/retroSounds";
import "./App.css";

type Session = SetupValues & { marbles: Marble[]; seed: number; course: RaceCourseSelection };
type Hud = { elapsedMs: number; fps: number; eliminatedCount: number; standings: readonly LiveStanding[]; boostRemainingMs: number };
type View = "setup" | "library" | "editor" | "race" | "results";
type BackChoice = { wasPaused: boolean; canLeave: boolean };
type Countdown = "PREPARING RACE…" | "READY" | "3" | "2" | "1" | "GO!";
const EMPTY_LIBRARY: TrackLibrary = { version: 1, tracks: [] };
const SELECTED_TRACK_KEY = "luckyroll.selectedTrack";
const NAVIGATION_STATE_KEY = "luckyRollNavigation";
const QUICK_PLAY: SetupValues = { prizePool: 0, participants: [
	{ id: "player-1", name: "Player 1", color: "#ff4f8f", symbol: "◆" },
	{ id: "player-2", name: "Player 2", color: "#58e7ff", symbol: "●" },
] };

function App() {
	const [view, setView] = useState<View>("setup");
	const [runtimeReady, setRuntimeReady] = useState(false);
	const [library, setLibrary] = useState<TrackLibrary>(EMPTY_LIBRARY);
	const [selectedTrackId, setSelectedTrackId] = useState<string>();
	const [editor, setEditor] = useState<EditorState>(() => createEditorState(createDefaultTrackDesign()));
	const [shareTrack, setShareTrack] = useState<TrackDesign>();
	const [message, setMessage] = useState("");
	const [libraryError, setLibraryError] = useState(false);
	const [session, setSession] = useState<Session>();
	const [finished, setFinished] = useState<Marble[]>([]);
	const [hud, setHud] = useState<Hud>({ elapsedMs: 0, fps: 0, eliminatedCount: 0, standings: [], boostRemainingMs: 5_000 });
	const [remaining, setRemaining] = useState<Marble[]>();
	const [celebrate, setCelebrate] = useState(false);
	const [paused, setPaused] = useState(false);
	const [birdView, setBirdView] = useState(false);
	const [muted, setMuted] = useState(false);
	const [sceneReady, setSceneReady] = useState(false);
	const [boostFlash, setBoostFlash] = useState(false);
	const [rush, setRush] = useState(false);
	const [countdown, setCountdown] = useState<Countdown>();
	const [backChoice, setBackChoice] = useState<BackChoice>();
	const [leaveGuidance, setLeaveGuidance] = useState("");
	const [raceReturnView, setRaceReturnView] = useState<"setup" | "library" | "editor">("setup");
	useEffect(() => { retroSounds.resetMusic(); }, [session]);
	useEffect(() => {
		retroSounds.music(view === "race" && !paused && !backChoice && !remaining && !muted ? (rush ? "rush" : "normal") : null);
		return () => retroSounds.music(null);
	}, [view, paused, backChoice, remaining, muted, rush, session]);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const sceneRef = useRef<RaceScene | undefined>(undefined);
	const backDialogRef = useRef<HTMLDialogElement>(null);
	const backChoiceRef = useRef<BackChoice | undefined>(undefined);
	const leaveFallbackRef = useRef<number | undefined>(undefined);
	const returningFromExitRef = useRef(false);
	const countdownActiveRef = useRef(false);
	const remainingRestartFramesRef = useRef<number[]>([]);
	const viewRef = useRef(view);
	const pausedRef = useRef(paused);
	viewRef.current = view;
	pausedRef.current = paused;

	useEffect(() => {
		const loaded = loadTrackLibrary(window.localStorage);
		if (loaded.ok) {
			setLibrary(loaded.library);
			const savedTrackId = window.localStorage.getItem(SELECTED_TRACK_KEY) ?? undefined;
			if (savedTrackId && loaded.library.tracks.some((track) => track.id === savedTrackId)) setSelectedTrackId(savedTrackId);
			else window.localStorage.removeItem(SELECTED_TRACK_KEY);
		}
		else { setLibraryError(true); setMessage(`Saved tracks could not be loaded: ${loaded.message}`); }
		if (!window.location.hash) return;
		try {
			const imported = decodeSharedTrack(window.location.href);
			setEditor(createEditorState({ name: imported.name, cells: imported.cells }));
			setView("editor"); setMessage("Shared track loaded. Save it to keep it in this browser.");
		} catch (error) { setMessage(error instanceof Error ? error.message : "Shared track could not be loaded."); }
	}, []);
	useEffect(() => {
		let active = true;
		void Promise.all([import("./game/MarbleRaceScene").then(({ initializeScenePhysics }) => initializeScenePhysics()), retroSounds.preload().catch(() => undefined)]).then(() => { if (active) setRuntimeReady(true); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Race engine could not load."));
		return () => { active = false; };
	}, []);
	useEffect(() => {
		if (!boostFlash) return;
		const timeout = window.setTimeout(() => setBoostFlash(false), 900);
		return () => window.clearTimeout(timeout);
	}, [boostFlash]);
	useEffect(() => {
		if (countdown !== "READY" && countdown !== "3" && countdown !== "2" && countdown !== "1" && countdown !== "GO!") return;
		if (backChoice) return;
		if (countdown === "READY") retroSounds.ready();
		else if (countdown !== "GO!") retroSounds.countdown();
		const timeout = window.setTimeout(() => {
			if (countdown === "READY") setCountdown("3");
			else if (countdown === "3") setCountdown("2");
			else if (countdown === "2") setCountdown("1");
			else if (countdown === "1") {
				countdownActiveRef.current = false; setCountdown("GO!"); setSceneReady(true);
				sceneRef.current?.setPaused(pausedRef.current || Boolean(backChoiceRef.current)); retroSounds.start();
			} else setCountdown(undefined);
		}, countdown === "GO!" ? 600 : 1_000);
		return () => window.clearTimeout(timeout);
	}, [backChoice, countdown]);

	const trackById = (id: string | undefined): LocalTrack | undefined => library.tracks.find((track) => track.id === id);
	const start = (values: SetupValues, track: TrackDesign | undefined = trackById(selectedTrackId), returnView: "setup" | "library" | "editor" = "setup") => {
		void retroSounds.preload().catch(() => undefined);
		const marbles = allocateMarbles(values.participants, 100);
		setMessage(""); setPaused(false); setBirdView(false); setSceneReady(false); setCelebrate(false); setRaceReturnView(returnView); countdownActiveRef.current = true; setCountdown("PREPARING RACE…");
		setSession({ ...values, marbles, seed: Date.now(), course: { kind: "custom", track: track ?? createDefaultTrackDesign("Default Track") } });
		setFinished([]); setRemaining(undefined); setBoostFlash(false); setRush(false); setHud({ elapsedMs: 0, fps: 0, eliminatedCount: 0, standings: [], boostRemainingMs: 5_000 }); setView("race");
	};

	useEffect(() => {
		if (view !== "race" || !session || !canvasRef.current) return;
		let active = true; let firstFrame: number | undefined; let secondFrame: number | undefined; let scene: RaceScene | undefined; let completed = 0; let finishers = 0;
		const fail = (error: unknown) => { if (active) { countdownActiveRef.current = false; setCountdown(undefined); setSceneReady(false); setMessage(error instanceof Error ? error.message : "Race could not start."); setView(raceReturnView); } };
		void import("./game/MarbleRaceScene").then(({ createRaceScene }) => {
			firstFrame = window.requestAnimationFrame(() => { secondFrame = window.requestAnimationFrame(() => {
			if (!active || !canvasRef.current) return;
			try {
			scene = createRaceScene(canvasRef.current, (event) => {
				if (!active) return;
				if (event.type === "prepared" && countdownActiveRef.current) setCountdown("READY");
				if (event.type === "rush") { retroSounds.rush(); setRush(true); }
				if (event.type === "tick") setHud({ elapsedMs: event.elapsedMs, fps: event.fps, eliminatedCount: event.eliminatedCount, standings: event.standings, boostRemainingMs: event.boostRemainingMs });
				if (event.type === "timeout") { retroSounds.timeout(); setRemaining(event.remaining); }
				if (event.type === "error") { countdownActiveRef.current = false; setCountdown(undefined); setMessage(event.message); setView(raceReturnView); }
				if (event.type === "finish" || event.type === "dnf") {
					completed += 1;
					if (event.type === "finish") { retroSounds.checkpoint(); finishers += 1; setFinished((current) => [...current, event.marble]); }
					else { retroSounds.dnf(); setMessage(`Marble #${event.marble.id} did not finish (${event.reason}).`); }
					if (completed === session.marbles.length) { const complete = finishers === session.marbles.length; if (complete) retroSounds.finish(); setCelebrate(complete); setView("results"); }
				}
			}, session.course);
			sceneRef.current = scene; scene.setPaused(true); scene.start(session.marbles, session.seed);
			} catch (error) { fail(error); }
			}); });
		}).catch(fail);
		return () => { active = false; if (firstFrame !== undefined) window.cancelAnimationFrame(firstFrame); if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame); scene?.dispose(); sceneRef.current = undefined; };
	}, [raceReturnView, session, view]);

	const importTrack = (input: string): string | undefined => {
		try { const track = decodeSharedTrack(input); setEditor(createEditorState({ name: track.name, cells: track.cells })); setView("editor"); setMessage("Imported track loaded. Save it to keep it."); return undefined; }
		catch (error) { return error instanceof Error ? error.message : "Track import failed."; }
	};
	const saveEditor = () => {
		try {
			const saved = upsertTrack(library, editor.draft, { id: editor.id, now: Date.now(), uuid: () => crypto.randomUUID() });
			persistTrackLibrary(window.localStorage, saved.library);
			setLibrary(saved.library); setSelectedTrackId(saved.track.id); setEditor(createEditorState(saved.track, saved.track.id)); setMessage("Track saved in this browser."); setView("library");
			try { window.localStorage.setItem(SELECTED_TRACK_KEY, saved.track.id); }
			catch (error) { setMessage(`Track saved, but its selection could not be remembered: ${error instanceof Error ? error.message : "storage error"}`); }
		} catch (error) { setMessage(error instanceof Error ? error.message : "Track could not be saved."); }
	};
	const removeTrack = (id: string) => {
		if (!window.confirm("Delete this track from this browser?")) return;
		try { const next = deleteTrack(library, id); persistTrackLibrary(window.localStorage, next); setLibrary(next); if (selectedTrackId === id) { setSelectedTrackId(undefined); window.localStorage.removeItem(SELECTED_TRACK_KEY); } }
		catch (error) { setMessage(error instanceof Error ? error.message : "Track could not be deleted."); }
	};
	const editTrack = (id: string) => { const track = trackById(id); if (track) { setEditor(createEditorState(track, id)); setView("editor"); } };
	const openShare = (track: TrackDesign | undefined) => { if (track) setShareTrack(track); };
	const cancelRemainingRestart = () => { remainingRestartFramesRef.current.forEach((frame) => window.cancelAnimationFrame(frame)); remainingRestartFramesRef.current = []; };
	const showResults = () => { cancelRemainingRestart(); countdownActiveRef.current = false; setCountdown(undefined); setRemaining(undefined); setCelebrate(false); setView("results"); };
	const restartAll = () => { if (!session) return; void retroSounds.preload().catch(() => undefined); cancelRemainingRestart(); retroSounds.stop(); setFinished([]); setRemaining(undefined); setBoostFlash(false); setRush(false); setHud({ elapsedMs: 0, fps: 0, eliminatedCount: 0, standings: [], boostRemainingMs: 5_000 }); setBirdView(false); setPaused(false); setSceneReady(false); setCelebrate(false); countdownActiveRef.current = true; setCountdown("PREPARING RACE…"); setSession({ ...session, seed: Date.now() }); setView("race"); };
	const restartRemaining = () => {
		if (!remaining) return;
		void retroSounds.preload().catch(() => undefined);
		const racers = remaining; retroSounds.stop(); cancelRemainingRestart(); setRemaining(undefined); setBoostFlash(false); setRush(false); setSceneReady(false); countdownActiveRef.current = true; setCountdown("PREPARING RACE…"); setHud((current) => ({ ...current, standings: [], boostRemainingMs: 5_000 })); sceneRef.current?.setPaused(true);
		const firstFrame = window.requestAnimationFrame(() => { const secondFrame = window.requestAnimationFrame(() => { remainingRestartFramesRef.current = []; if (countdownActiveRef.current && viewRef.current === "race") sceneRef.current?.restartRemaining(racers); }); remainingRestartFramesRef.current = [secondFrame]; });
		remainingRestartFramesRef.current = [firstFrame];
	};
	const again = () => { cancelRemainingRestart(); retroSounds.stop(); countdownActiveRef.current = false; setCountdown(undefined); setSession(undefined); setFinished([]); setRush(false); setPaused(false); setBirdView(false); setSceneReady(false); setView(raceReturnView); };
	const backToMenu = () => { cancelRemainingRestart(); retroSounds.stop(); countdownActiveRef.current = false; setCountdown(undefined); setShareTrack(undefined); setSession(undefined); setFinished([]); setRemaining(undefined); setRush(false); setPaused(false); setBirdView(false); setSceneReady(false); setCelebrate(false); setView("setup"); };
	const dismissBackChoice = () => {
		const choice = backChoiceRef.current;
		if (choice && viewRef.current === "race") { setPaused(choice.wasPaused); sceneRef.current?.setPaused(choice.wasPaused || countdownActiveRef.current); }
		backChoiceRef.current = undefined; setBackChoice(undefined);
	};
	const chooseMainMenu = () => { backChoiceRef.current = undefined; setBackChoice(undefined); backToMenu(); };
	const leaveGame = () => {
		const canLeave = backChoiceRef.current?.canLeave ?? false;
		backChoiceRef.current = undefined; setBackChoice(undefined); backToMenu();
		if (!canLeave) { setLeaveGuidance("No previous page is available. You can close this tab when you're finished."); return; }
		returningFromExitRef.current = true;
		const cancelFallback = () => { if (leaveFallbackRef.current !== undefined) window.clearTimeout(leaveFallbackRef.current); leaveFallbackRef.current = undefined; };
		window.addEventListener("pagehide", cancelFallback, { once: true });
		leaveFallbackRef.current = window.setTimeout(() => { window.removeEventListener("pagehide", cancelFallback); leaveFallbackRef.current = undefined; returningFromExitRef.current = false; setLeaveGuidance("No previous page is available. You can close this tab when you're finished."); }, 750);
		window.history.go(-2);
	};

	useEffect(() => {
		if (!backChoice) return;
		const dialog = backDialogRef.current;
		dialog?.showModal();
		return () => { if (dialog?.open) dialog.close(); };
	}, [backChoice, runtimeReady]);
	useEffect(() => {
		const restartFrames = remainingRestartFramesRef;
		return () => { retroSounds.stop(); if (leaveFallbackRef.current !== undefined) window.clearTimeout(leaveFallbackRef.current); restartFrames.current.forEach((frame) => window.cancelAnimationFrame(frame)); };
	}, []);
	useEffect(() => {
		type NavigationState = { position: "base" | "guard"; hadPrevious: boolean };
		const readMarker = (state: unknown): NavigationState | undefined => state && typeof state === "object" ? (state as Record<string, NavigationState>)[NAVIGATION_STATE_KEY] : undefined;
		const addMarker = (state: unknown, marker: NavigationState) => ({ ...(state && typeof state === "object" ? state : {}), [NAVIGATION_STATE_KEY]: marker });
		let marker = readMarker(window.history.state);
		if (!marker) {
			marker = { position: "base", hadPrevious: window.history.length > 1 };
			window.history.replaceState(addMarker(window.history.state, marker), "", window.location.href);
			window.history.pushState(addMarker(window.history.state, { ...marker, position: "guard" }), "", window.location.href);
		} else if (marker.position === "base") {
			window.history.pushState(addMarker(window.history.state, { ...marker, position: "guard" }), "", window.location.href);
		}
		const onPopState = (event: PopStateEvent) => {
			const popped = readMarker(event.state);
			if (popped?.position !== "base") return;
			window.history.pushState(addMarker(event.state, { ...popped, position: "guard" }), "", window.location.href);
			if (returningFromExitRef.current) { returningFromExitRef.current = false; return; }
			if (backChoiceRef.current) return;
			const choice = { wasPaused: pausedRef.current, canLeave: popped.hadPrevious };
			backChoiceRef.current = choice; setBackChoice(choice);
			if (viewRef.current === "race") { sceneRef.current?.setPaused(true); retroSounds.stop(); setPaused(true); }
		};
		const onPageShow = () => {
			if (!returningFromExitRef.current) return;
			window.setTimeout(() => {
				if (!returningFromExitRef.current) return;
				const current = readMarker(window.history.state);
				if (current?.position === "base") window.history.pushState(addMarker(window.history.state, { ...current, position: "guard" }), "", window.location.href);
				returningFromExitRef.current = false;
			}, 0);
		};
		window.addEventListener("popstate", onPopState);
		window.addEventListener("pageshow", onPageShow);
		return () => { window.removeEventListener("popstate", onPopState); window.removeEventListener("pageshow", onPageShow); };
	}, []);
	const selectTrack = (id?: string) => { setSelectedTrackId(id); if (id) window.localStorage.setItem(SELECTED_TRACK_KEY, id); else window.localStorage.removeItem(SELECTED_TRACK_KEY); };
	const boost = () => { if (rush || !sceneReady || paused || backChoice || remaining || hud.boostRemainingMs > 0 || !sceneRef.current?.boost()) return; retroSounds.boost(); setHud((current) => ({ ...current, boostRemainingMs: 5_000 })); setBoostFlash(true); };
	const participants: Participant[] = session?.participants ?? [];
	const raceBackLabel = raceReturnView === "setup" ? "Back to Menu" : raceReturnView === "library" ? "Back to Tracks" : "Back to Editor";
	const boostFill = `${100 - Math.min(100, hud.boostRemainingMs / 50)}%`;
	const backTitle = view === "setup" ? "QUIT GAME?" : view === "race" ? "PAUSE MENU" : "GAME MENU";
	const continueLabel = view === "race" ? "RESUME" : "CONTINUE";
	const playUiClick = (event: MouseEvent<HTMLElement>) => {
		if (event.target instanceof Element && event.target.closest('button:not(:disabled):not([aria-disabled="true"]):not(.boost-button)')) retroSounds.click();
	};
	const backNavigation = backChoice && <dialog ref={backDialogRef} className="dialog-backdrop back-choice-dialog" aria-labelledby="back-choice-title" onCancel={(event) => { event.preventDefault(); dismissBackChoice(); }} onClick={(event) => { if (event.target === event.currentTarget) dismissBackChoice(); }}><section className="timeout-dialog"><h2 id="back-choice-title">{backTitle}</h2><div className="dialog-actions">{view === "setup" ? <><button className="secondary-button" onClick={leaveGame}>QUIT</button><button className="text-button" onClick={dismissBackChoice}>CANCEL</button></> : <><button className="primary-button" onClick={dismissBackChoice}>{continueLabel}</button><button className="secondary-button" onClick={chooseMainMenu}>MAIN MENU</button><button className="text-button" onClick={leaveGame}>QUIT GAME</button></>}</div></section></dialog>;
	const leaveNotice = leaveGuidance && <div className="app-message leave-guidance" role="status">{leaveGuidance}<button onClick={() => setLeaveGuidance("")}>Dismiss</button></div>;

	if (!runtimeReady) return <main className="app-shell" onClick={playUiClick}><section className="setup-card" role="status"><p className="eyebrow">LUCKY ROLL</p><h1>Loading race engine…</h1>{message && <p>{message}</p>}</section>{backNavigation}{leaveNotice}</main>;
	return <main className="app-shell" onClick={playUiClick}>
		{message && <div className="app-message" role="status">{message}{libraryError && <button onClick={() => { try { const next = resetTrackLibrary(window.localStorage); setLibrary(next); setLibraryError(false); setMessage("Saved track storage reset."); } catch (error) { setMessage(error instanceof Error ? error.message : "Saved track storage could not be reset."); } }}>Reset saved tracks</button>}</div>}
		<div hidden={view !== "setup"}><SetupScreen onStart={start} tracks={library.tracks} selectedTrackId={selectedTrackId} onSelectTrack={selectTrack} onManageTracks={() => setView("library")} /></div>
		{view === "library" && <TrackLibraryPanel tracks={library.tracks} selectedTrackId={selectedTrackId} onBack={() => setView("setup")} onNew={() => { setEditor(createEditorState(createDefaultTrackDesign())); setView("editor"); }} onEdit={editTrack} onSelect={selectTrack} onPlay={(id) => { const track = trackById(id); if (track) { selectTrack(id); start(QUICK_PLAY, track, "library"); } }} onShare={(id) => openShare(trackById(id))} onDelete={removeTrack} onImport={importTrack} />}
		{view === "editor" && <TrackEditor state={editor} onChange={setEditor} onBack={() => setView("library")} onSave={saveEditor} onShare={() => openShare(editor.draft)} onPlay={() => start(QUICK_PLAY, editor.draft, "editor")} />}
		{view === "race" && session && <section className="race-stage"><canvas ref={canvasRef} /><RaceHud elapsedMs={hud.elapsedMs} fps={hud.fps} eliminatedCount={hud.eliminatedCount} total={session.marbles.length} standings={hud.standings} finished={finished} participants={session.participants} />{rush && <div className="rush-hud" role="status"><strong>RUSH!</strong><i aria-hidden="true" /></div>}{countdown && <div className={countdown === "PREPARING RACE…" ? "race-countdown preparing" : "race-countdown"} role="status" aria-live="assertive"><strong>{countdown}</strong></div>}<div className="race-actions"><button disabled={!sceneReady} onClick={() => { const next = !birdView; setBirdView(next); sceneRef.current?.setBirdView(next); }}>{birdView ? "Auto Camera" : "Bird View"}</button><button disabled={!sceneReady} onClick={() => { const next = !paused; setPaused(next); sceneRef.current?.setPaused(next); if (next) retroSounds.stop(); }}>{paused ? "Resume" : "Pause"}</button><button onClick={() => { const next = !muted; setMuted(next); retroSounds.setMuted(next); }}>{muted ? "Sound on" : "Mute"}</button><button onClick={again}>{raceBackLabel}</button></div><div className="boost-dock"><button className={rush ? "boost-button rush-locked" : hud.boostRemainingMs === 0 ? "boost-button ready" : "boost-button"} disabled={rush || !sceneReady || paused || Boolean(backChoice) || Boolean(remaining) || hud.boostRemainingMs > 0} onClick={boost} aria-label={rush ? "Boost unavailable during RUSH" : hud.boostRemainingMs === 0 ? "Boost ready" : `Boost charging, ${(hud.boostRemainingMs / 1000).toFixed(1)} seconds remaining`} style={{ "--boost-fill": boostFill } as CSSProperties}><i /><span>{rush ? "LOCKED" : "BOOST"}</span><small>{rush ? "RUSH" : hud.boostRemainingMs === 0 ? "READY" : `${(hud.boostRemainingMs / 1000).toFixed(1)}s`}</small></button></div>{boostFlash && <strong className="boost-flash" role="status">BOOST!</strong>}{remaining && <TimeoutDialog remaining={remaining} onRemaining={restartRemaining} onRestart={restartAll} onResults={showResults} />}</section>}
		{view === "results" && <ResultsScreen rankings={reverseRank(finished)} participants={participants} prizePool={session?.prizePool ?? 0} celebrate={celebrate} onReplay={restartAll} onBack={backToMenu} />}
		{shareTrack && <ShareTrackDialog track={shareTrack} writeText={navigator.clipboard?.writeText.bind(navigator.clipboard)} onClose={() => setShareTrack(undefined)} />}
		{backNavigation}
		{leaveNotice}
	</main>;
}

export default App;
