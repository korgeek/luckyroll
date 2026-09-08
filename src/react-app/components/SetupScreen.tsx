import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { Participant } from "../domain/types";
import type { LocalTrack } from "../designer/trackDesign";

export type SetupValues = { participants: Participant[]; prizePool: number };

const COLORS = ["#ff4f8f", "#58e7ff", "#ffcf58", "#a883ff", "#6dffae", "#ff8b55", "#ff75d5", "#75aaff", "#e8ff5a", "#ff6278"];
const SYMBOLS = ["◆", "●", "▲", "✦", "■", "✚", "♥", "✿", "☀", "✹"];
const formatPrizePool = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export type SetupScreenProps = Readonly<{
	onStart: (values: SetupValues) => void;
	tracks?: readonly LocalTrack[];
	selectedTrackId?: string;
	onManageTracks?: () => void;
	onSelectTrack?: (id?: string) => void;
}>;

export function SetupScreen({ onStart, tracks = [], selectedTrackId, onManageTracks = () => undefined, onSelectTrack = () => undefined }: SetupScreenProps) {
	const [names, setNames] = useState(["Player 1", "Player 2"]);
	const [prizePool, setPrizePool] = useState("");
	const [prizeRevision, setPrizeRevision] = useState(0);
	const [pickerOpen, setPickerOpen] = useState(false);
	const dialog = useRef<HTMLDialogElement>(null); const prizeInput = useRef<HTMLInputElement>(null); const prizeCaret = useRef<number | undefined>(undefined);
	const pickerButton = useRef<HTMLButtonElement>(null);
	const selectedTrack = tracks.find((track) => track.id === selectedTrackId);
	const selectedTrackName = selectedTrack?.name || "Default Track";
	useEffect(() => {
		if (!pickerOpen || !dialog.current) return;
		const current = dialog.current; const opener = pickerButton.current;
		current.showModal();
		return () => { if (current.open) current.close(); opener?.focus(); };
	}, [pickerOpen]);
	const update = (index: number, value: string) => setNames((current) => current.map((name, nameIndex) => nameIndex === index ? value : name));
	useLayoutEffect(() => {
		const input = prizeInput.current; const digitCaret = prizeCaret.current;
		if (!input || digitCaret === undefined) return;
		let seen = 0; let caret = digitCaret === 0 ? 0 : input.value.length;
		for (let index = 0; index < input.value.length; index += 1) if (/\d/.test(input.value[index]!)) { seen += 1; if (seen === digitCaret) { caret = index + 1; break; } }
		input.setSelectionRange(caret, caret); prizeCaret.current = undefined;
	}, [prizePool, prizeRevision]);
	const updatePrizePool = (event: ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value; const digitCaret = value.slice(0, event.target.selectionStart ?? value.length).replace(/\D/g, "").length;
		const digits = value.replace(/\D/g, ""); prizeCaret.current = digitCaret;
		if (digits === prizePool) setPrizeRevision((revision) => revision + 1); else setPrizePool(digits);
	};
	const prizeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		const input = event.currentTarget; const start = input.selectionStart ?? 0;
		if (input.selectionStart !== input.selectionEnd || (event.key !== "Backspace" && event.key !== "Delete")) return;
		const remove = event.key === "Backspace" && input.value[start - 1] === "," ? start - 2 : event.key === "Delete" && input.value[start] === "," ? start + 1 : -1;
		if (remove < 0) return;
		event.preventDefault(); prizeCaret.current = input.value.slice(0, Math.max(0, remove)).replace(/\D/g, "").length;
		setPrizePool((input.value.slice(0, remove) + input.value.slice(remove + 1)).replace(/\D/g, ""));
	};
	const submit = () => onStart({ prizePool: Number(prizePool) || 0, participants: names.map((name, index) => ({ id: `player-${index + 1}`, name: name.trim() || `Player ${index + 1}`, color: COLORS[index], symbol: SYMBOLS[index] })) });
	const chooseTrack = (id?: string) => { onSelectTrack(id); setPickerOpen(false); };

	return <section className="setup-card" aria-label="Main menu">
		<p className="eyebrow">INSTANT PARTY GAME</p><h1>LUCKY ROLL</h1><p className="tagline">Who&apos;s last?</p>
		<button className="primary-button setup-start" onClick={submit}>START RACE · {selectedTrackName}</button>
		<div className="section-title"><span>PLAYERS</span><button className="text-button" onClick={() => setNames((current) => [...current].sort(() => Math.random() - 0.5))}>Shuffle</button></div>
		<div className="name-list">{names.map((name, index) => <label className="name-row" key={index}><span className="player-dot" style={{ background: COLORS[index] }}>{SYMBOLS[index]}</span><span className="sr-only">Player {index + 1}</span><input aria-label={`Player ${index + 1}`} value={name} maxLength={16} onChange={(event) => update(index, event.target.value)} />{names.length > 2 && <button className="remove-button" aria-label={`Remove player ${index + 1}`} onClick={() => setNames((current) => current.filter((_, removeIndex) => removeIndex !== index))}>×</button>}</label>)}</div>
		{names.length < 10 && <button className="add-button" onClick={() => setNames((current) => [...current, `Player ${current.length + 1}`])}>+ Add player</button>}
		<label className="field-label">Prize Pool <span>optional</span><input ref={prizeInput} aria-label="Prize Pool" inputMode="numeric" placeholder="0" value={formatPrizePool(prizePool)} onChange={updatePrizePool} onKeyDown={prizeKeyDown} /></label>
		<p className="allocation-note">100 marbles split as evenly as possible.</p>
		<section className="track-summary" aria-label="Selected track"><div><span>TRACK</span><strong>{selectedTrackName}</strong><small>{tracks.length} saved {tracks.length === 1 ? "track" : "tracks"}</small></div><div className="track-summary-actions"><button ref={pickerButton} className="secondary-button" onClick={() => setPickerOpen(true)}>Change Track</button><button className="text-button" onClick={onManageTracks}>Manage Tracks</button></div></section>
		{pickerOpen && <dialog ref={dialog} className="dialog-backdrop" aria-label="Choose a track" onCancel={(event) => { event.preventDefault(); setPickerOpen(false); }} onClick={(event) => event.target === event.currentTarget && setPickerOpen(false)}><section className="share-dialog track-picker"><h2>Choose a track</h2><button aria-label="Select Default Track" aria-pressed={!selectedTrackId} onClick={() => chooseTrack(undefined)}>Default Track {!selectedTrackId && <span>Selected</span>}</button>{tracks.map((track) => <button key={track.id} aria-label={`Select ${track.name || "Unnamed track"}, track ${track.id}`} aria-pressed={track.id === selectedTrackId} onClick={() => chooseTrack(track.id)}>{track.name || "Unnamed track"} {track.id === selectedTrackId && <span>Selected</span>}</button>)}<button className="text-button" onClick={() => setPickerOpen(false)}>Cancel</button></section></dialog>}
	</section>;
}
