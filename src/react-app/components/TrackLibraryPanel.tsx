import { useState } from "react";
import type { LocalTrack } from "../designer/trackDesign";

export type TrackLibraryPanelProps = Readonly<{
	tracks: readonly LocalTrack[];
	selectedTrackId?: string;
	onNew: () => void;
	onEdit: (id: string) => void;
	onSelect: (id?: string) => void;
	onPlay: (id: string) => void;
	onShare: (id: string) => void;
	onDelete: (id: string) => void;
	onImport: (input: string) => void;
}>;

export function TrackLibraryPanel({ tracks, selectedTrackId, onNew, onEdit, onSelect, onPlay, onShare, onDelete, onImport }: TrackLibraryPanelProps) {
	const [input, setInput] = useState("");
	const sortedTracks = [...tracks].sort((a, b) => b.updatedAt - a.updatedAt);
	return <section className="track-library" aria-label="Track Designer">
		<div className="section-title"><span>TRACK DESIGNER</span><button className="text-button" onClick={onNew}>New Track</button></div>
		<section className="builtin-track" aria-label="Built-in tracks">
			<h2>Built-in track</h2>
			<button className={!selectedTrackId ? "selected" : ""} aria-pressed={!selectedTrackId} onClick={() => onSelect(undefined)}>Built-in track</button>
		</section>
		{sortedTracks.length > 0 && <ul className="track-list" aria-label="Saved tracks">{sortedTracks.map((track) => <li key={track.id} className={track.id === selectedTrackId ? "selected-track" : ""}>
			<strong>{track.name || "Unnamed track"}</strong><small>Track ID: {track.id}</small>
			<div className="track-actions">
				<button aria-pressed={track.id === selectedTrackId} onClick={() => onSelect(track.id)}>Select {track.name}, track {track.id}</button>
				<button onClick={() => onEdit(track.id)}>Edit {track.name}, track {track.id}</button>
				<button onClick={() => onPlay(track.id)}>Play {track.name}, track {track.id}</button>
				<button onClick={() => onShare(track.id)}>Share {track.name}, track {track.id}</button>
				<button onClick={() => onDelete(track.id)}>Delete {track.name}, track {track.id}</button>
			</div>
		</li>)}</ul>}
		<form className="track-import" onSubmit={(event) => { event.preventDefault(); onImport(input); }}>
			<label>Import track<input aria-label="Import track" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste a track link or token" /></label>
			<button type="submit">Import</button>
		</form>
	</section>;
}
