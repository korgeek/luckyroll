import { useState } from "react";
import type { Participant } from "../domain/types";
import type { LocalTrack } from "../designer/trackDesign";
import { TrackLibraryPanel } from "./TrackLibraryPanel";

export type GameMode = "race" | "teams";
export type SetupValues = { mode: GameMode; participants: Participant[]; prizePool: number; teamCount: 2 | 3 };

const COLORS = ["#ff4f8f", "#58e7ff", "#ffcf58", "#a883ff", "#6dffae", "#ff8b55", "#ff75d5", "#75aaff", "#e8ff5a", "#ff6278"];
const SYMBOLS = ["◆", "●", "▲", "✦", "■", "✚", "♥", "✿", "☀", "✹"];

export type SetupScreenProps = Readonly<{
	onStart: (values: SetupValues) => void;
	tracks?: readonly LocalTrack[];
	selectedTrackId?: string;
	onNewTrack?: () => void;
	onEditTrack?: (id: string) => void;
	onSelectTrack?: (id?: string) => void;
	onPlayTrack?: (id: string) => void;
	onShareTrack?: (id: string) => void;
	onDeleteTrack?: (id: string) => void;
	onImportTrack?: (input: string) => void;
}>;

export function SetupScreen({ onStart, tracks = [], selectedTrackId, onNewTrack = () => undefined, onEditTrack = () => undefined, onSelectTrack = () => undefined, onPlayTrack = () => undefined, onShareTrack = () => undefined, onDeleteTrack = () => undefined, onImportTrack = () => undefined }: SetupScreenProps) {
	const [mode, setMode] = useState<GameMode>("race");
	const [names, setNames] = useState(["Player 1", "Player 2"]);
	const [prizePool, setPrizePool] = useState("");
	const [teamCount, setTeamCount] = useState<2 | 3>(2);
	const update = (index: number, value: string) => setNames((current) => current.map((name, nameIndex) => nameIndex === index ? value : name));
	const submit = () => onStart({ mode, prizePool: Number(prizePool) || 0, teamCount, participants: names.map((name, index) => ({ id: `player-${index + 1}`, name: name.trim() || `Player ${index + 1}`, color: COLORS[index], symbol: SYMBOLS[index] })) });

	return <section className="setup-card" aria-label="Game setup">
		<p className="eyebrow">INSTANT PARTY GAME</p><h1>LUCKY ROLL</h1><p className="tagline">Who&apos;s last?</p>
		<div className="mode-switch"><button className={mode === "race" ? "selected" : ""} onClick={() => setMode("race")}>Race</button><button className={mode === "teams" ? "selected" : ""} onClick={() => setMode("teams")}>Team Split</button></div>
		<div className="section-title"><span>PLAYERS</span><button className="text-button" onClick={() => setNames((current) => [...current].sort(() => Math.random() - 0.5))}>Shuffle</button></div>
		<div className="name-list">{names.map((name, index) => <label className="name-row" key={index}><span className="player-dot" style={{ background: COLORS[index] }}>{SYMBOLS[index]}</span><span className="sr-only">Player {index + 1}</span><input aria-label={`Player ${index + 1}`} value={name} maxLength={16} onChange={(event) => update(index, event.target.value)} />{names.length > 2 && <button className="remove-button" aria-label={`Remove player ${index + 1}`} onClick={() => setNames((current) => current.filter((_, removeIndex) => removeIndex !== index))}>×</button>}</label>)}</div>
		{names.length < 10 && <button className="add-button" onClick={() => setNames((current) => [...current, `Player ${current.length + 1}`])}>+ Add player</button>}
		{mode === "race" ? <label className="field-label">Prize Pool <span>optional</span><input aria-label="Prize Pool" inputMode="numeric" placeholder="0" value={prizePool} onChange={(event) => setPrizePool(event.target.value.replace(/[^0-9]/g, ""))} /></label> : <div className="team-choice"><span>Teams</span><button className={teamCount === 2 ? "selected" : ""} onClick={() => setTeamCount(2)}>2 Teams</button><button className={teamCount === 3 ? "selected" : ""} disabled={names.length < 3} onClick={() => setTeamCount(3)}>3 Teams</button></div>}
		<p className="allocation-note">{mode === "race" ? "100 marbles split as evenly as possible." : "Everyone gets one marble. Teams stay balanced."}</p>
		<button className="primary-button" onClick={submit}>{mode === "race" ? "START RACE" : "MIX TEAMS"}</button>
		<TrackLibraryPanel tracks={tracks} selectedTrackId={selectedTrackId} onNew={onNewTrack} onEdit={onEditTrack} onSelect={onSelectTrack} onPlay={onPlayTrack} onShare={onShareTrack} onDelete={onDeleteTrack} onImport={onImportTrack} />
	</section>;
}
