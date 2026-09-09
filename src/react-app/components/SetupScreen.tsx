import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { CreditsDialog } from "./CreditsDialog";
import type { Participant } from "../domain/types";
import { moneyCents, PAYOUT_MODES, TOP3_RULES, type PayoutMode } from "../domain/race";
import { BUILTIN_TRACKS, type LocalTrack, type TrackDesign } from "../designer/trackDesign";

export type SetupValues = { participants: Participant[]; prizePool: number; payoutMode?: PayoutMode; marbleCount?: 50 | 100 };

const COLORS = ["#ff4f8f", "#58e7ff", "#ffcf58", "#a883ff", "#6dffae", "#ff8b55", "#ff75d5", "#75aaff", "#e8ff5a", "#ff6278"];
const SYMBOLS = ["◆", "●", "▲", "✦", "■", "✚", "♥", "✿", "☀", "✹"];
const formatPrizePool = (value: string): string => { const [whole, fraction] = value.split("."); return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction === undefined ? "" : `.${fraction}`); };

export type SetupScreenProps = Readonly<{
	active?: boolean;
	onStart: (values: SetupValues, track?: TrackDesign) => void;
	tracks?: readonly LocalTrack[];
	selectedTrackId?: string;
	onManageTracks?: () => void;
	onSelectTrack?: (id?: string) => void;
}>;

export function SetupScreen({ active = true, onStart, tracks = [], selectedTrackId, onManageTracks = () => undefined, onSelectTrack = () => undefined }: SetupScreenProps) {
	const [names, setNames] = useState(["Player 1", "Player 2"]);
	const [prizePool, setPrizePool] = useState("");
	const [payoutMode, setPayoutMode] = useState<PayoutMode>("winner");
	const [marbleCount, setMarbleCount] = useState<50 | 100>(50);
	const [prizeRevision, setPrizeRevision] = useState(0);
	const [creditsOpen, setCreditsOpen] = useState(false);
	const [pickerOpen, setPickerOpen] = useState<"select" | "start" | false>(false);
	const [pickerTrackId, setPickerTrackId] = useState(selectedTrackId);
	const dialog = useRef<HTMLDialogElement>(null); const prizeInput = useRef<HTMLInputElement>(null); const prizeCaret = useRef<number | undefined>(undefined);
	const pickerButton = useRef<HTMLButtonElement>(null);
	const startButton = useRef<HTMLButtonElement>(null);
	const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? BUILTIN_TRACKS.find(({ id }) => id === selectedTrackId)?.track;
	const selectedTrackName = selectedTrack?.name || "60-Second Track";
	useEffect(() => {
		if (!active || !pickerOpen || !dialog.current) return;
		const current = dialog.current; const opener = pickerOpen === "start" ? startButton.current : pickerButton.current;
		current.showModal();
		return () => { if (current.open) current.close(); opener?.focus(); };
	}, [active, pickerOpen]);
	const update = (index: number, value: string) => setNames((current) => current.map((name, nameIndex) => nameIndex === index ? value : name));
	useLayoutEffect(() => {
		const input = prizeInput.current; const digitCaret = prizeCaret.current;
		if (!input || digitCaret === undefined) return;
		let seen = 0; let caret = digitCaret === 0 ? 0 : input.value.length;
		for (let index = 0; index < input.value.length; index += 1) if (/[\d.]/.test(input.value[index]!)) { seen += 1; if (seen === digitCaret) { caret = index + 1; break; } }
		input.setSelectionRange(caret, caret); prizeCaret.current = undefined;
	}, [prizePool, prizeRevision]);
	const updatePrizePool = (event: ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value; const digitCaret = value.slice(0, event.target.selectionStart ?? value.length).replace(/[^\d.]/g, "").length;
		const clean = value.replace(/[^\d.]/g, "");
		const digits = clean.replace(/^\./, "0."); prizeCaret.current = digitCaret + (clean.startsWith(".") ? 1 : 0);
		if (!/^\d{0,12}(\.\d{0,2})?$/.test(digits)) { setPrizeRevision((revision) => revision + 1); return; }
		if (digits === prizePool) setPrizeRevision((revision) => revision + 1); else setPrizePool(digits);
	};
	const prizeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		const input = event.currentTarget; const start = input.selectionStart ?? 0;
		if (input.selectionStart !== input.selectionEnd || (event.key !== "Backspace" && event.key !== "Delete")) return;
		const remove = event.key === "Backspace" && input.value[start - 1] === "," ? start - 2 : event.key === "Delete" && input.value[start] === "," ? start + 1 : -1;
		if (remove < 0) return;
		event.preventDefault(); prizeCaret.current = input.value.slice(0, Math.max(0, remove)).replace(/[^\d.]/g, "").length;
		setPrizePool((input.value.slice(0, remove) + input.value.slice(remove + 1)).replace(/[^\d.]/g, "").replace(/^\./, "0."));
	};
	const submit = (track: TrackDesign) => onStart({ prizePool: moneyCents(prizePool || "0") / 100, payoutMode, marbleCount, participants: names.map((name, index) => ({ id: `player-${index + 1}`, name: name.trim() || `Player ${index + 1}`, color: COLORS[index], symbol: SYMBOLS[index] })) }, track);
	const openPicker = (intent: "select" | "start") => { setPickerTrackId(selectedTrackId); setPickerOpen(intent); };
	const chooseTrack = (id?: string) => { setPickerTrackId(id); onSelectTrack(id); };
	const startSelectedTrack = () => { const track = tracks.find((candidate) => candidate.id === pickerTrackId) ?? BUILTIN_TRACKS.find((candidate) => candidate.id === pickerTrackId)?.track ?? BUILTIN_TRACKS[0].track; setPickerOpen(false); submit(track); };

	return <section className="setup-card" aria-label="Main menu">
		<p className="eyebrow">INSTANT PARTY GAME</p><h1>LUCKY ROLL</h1><p className="tagline">Who&apos;s last?</p>
		<button ref={startButton} className="primary-button setup-start" onClick={() => openPicker("start")}>START RACE · {selectedTrackName}</button>
		<div className="section-title"><span>PLAYERS</span><button className="text-button" onClick={() => setNames((current) => [...current].sort(() => Math.random() - 0.5))}>Shuffle</button></div>
		<div className="name-list">{names.map((name, index) => <label className="name-row" key={index}><span className="player-dot" style={{ background: COLORS[index] }}>{SYMBOLS[index]}</span><span className="sr-only">Player {index + 1}</span><input aria-label={`Player ${index + 1}`} value={name} maxLength={16} onChange={(event) => update(index, event.target.value)} />{names.length > 2 && <button className="remove-button" aria-label={`Remove player ${index + 1}`} onClick={() => setNames((current) => current.filter((_, removeIndex) => removeIndex !== index))}>×</button>}</label>)}</div>
		{names.length < 10 && <button className="add-button" onClick={() => setNames((current) => [...current, `Player ${current.length + 1}`])}>+ Add player</button>}
		<label className="field-label prize-field">Prize Pool <span>optional</span><input ref={prizeInput} aria-label="Prize Pool" inputMode="decimal" placeholder="0.00" value={formatPrizePool(prizePool)} onChange={updatePrizePool} onKeyDown={prizeKeyDown} onBlur={() => { if (prizePool) { const [whole, fraction = ""] = prizePool.split("."); setPrizePool(`${Number(whole)}.${fraction.padEnd(2, "0")}`); } }} /></label>
		<fieldset className="payout-options"><legend>Payout</legend>{PAYOUT_MODES.map(({ id, label }) => <label key={id}><input type="radio" name="payout-mode" value={id} checked={payoutMode === id} onChange={() => setPayoutMode(id)} /><span>{label}</span></label>)}</fieldset>
		<p className="payout-note">{payoutMode === "winner" ? "Last marble standing takes the whole pot!" : TOP3_RULES}</p>
		<p className="allocation-note">{marbleCount} marbles split as evenly as possible.</p>
		<section className="track-summary" aria-label="Selected track"><div><span>TRACK</span><strong>{selectedTrackName}</strong><small>{tracks.length} saved {tracks.length === 1 ? "track" : "tracks"}</small></div><div className="track-summary-actions"><button ref={pickerButton} className="secondary-button" onClick={() => openPicker("select")}>Change Track</button><button className="text-button" onClick={onManageTracks}>Manage Tracks</button></div></section>
		{pickerOpen && <dialog ref={dialog} className="dialog-backdrop" aria-label="Choose a track" onCancel={(event) => { event.preventDefault(); setPickerOpen(false); }} onClick={(event) => event.target === event.currentTarget && setPickerOpen(false)}><section className="share-dialog track-picker"><h2>Choose a track</h2><p>Choose a course. Times are estimates and vary with each race.</p><fieldset className="payout-options marble-count-options"><legend>Marbles</legend>{([50, 100] as const).map((count) => <label key={count}><input type="radio" name="marble-count" checked={marbleCount === count} onChange={() => setMarbleCount(count)} /><span>{count}</span></label>)}</fieldset>{BUILTIN_TRACKS.map(({ id, track }) => <button key={id ?? "builtin-60"} aria-label={`Select ${track.name}`} aria-pressed={id === pickerTrackId} onClick={() => chooseTrack(id)}>{track.name} {id === pickerTrackId && <span>Selected</span>}</button>)}{tracks.map((track) => <button key={track.id} aria-label={`Select ${track.name || "Unnamed track"}, track ${track.id}`} aria-pressed={track.id === pickerTrackId} onClick={() => chooseTrack(track.id)}>{track.name || "Unnamed track"} {track.id === pickerTrackId && <span>Selected</span>}</button>)}<div className="track-picker-actions"><button className="primary-button" onClick={startSelectedTrack}>START</button><button className="secondary-button" onClick={() => setPickerOpen(false)}>BACK</button></div></section></dialog>}
<footer className="setup-footer"><button className="text-button" onClick={() => setCreditsOpen(true)}>Credits</button></footer>
		{creditsOpen && <CreditsDialog onClose={() => setCreditsOpen(false)} />}
	</section>;
}
