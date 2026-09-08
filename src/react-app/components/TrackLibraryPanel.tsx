import { useEffect, useRef, useState } from "react";
import type { LocalTrack } from "../designer/trackDesign";

export type TrackLibraryPanelProps = Readonly<{
	tracks: readonly LocalTrack[];
	selectedTrackId?: string;
	onBack: () => void;
	onNew: () => void;
	onEdit: (id: string) => void;
	onSelect: (id?: string) => void;
	onPlay: (id: string) => void;
	onShare: (id: string) => void;
	onDelete: (id: string) => void;
	onImport: (input: string) => string | undefined;
}>;

export function TrackLibraryPanel({ tracks, selectedTrackId, onBack, onNew, onEdit, onSelect, onPlay, onShare, onDelete, onImport }: TrackLibraryPanelProps) {
	const [importOpen, setImportOpen] = useState(false);
	const [input, setInput] = useState("");
	const [error, setError] = useState("");
	const dialog = useRef<HTMLDialogElement>(null);
	const importButton = useRef<HTMLButtonElement>(null);
	const sortedTracks = [...tracks].sort((a, b) => b.updatedAt - a.updatedAt);
	useEffect(() => {
		if (!importOpen || !dialog.current) return;
		const current = dialog.current;
		const opener = importButton.current;
		current.showModal();
		return () => { if (current.open) current.close(); opener?.focus(); };
	}, [importOpen]);
	const closeImport = () => { setImportOpen(false); setError(""); };
	return <section className="track-library" aria-label="Track management">
		<header className="track-library-header"><button className="secondary-button" onClick={onBack}>Back to Menu</button><div><p className="eyebrow">TRACK MANAGEMENT</p><h1>Your tracks</h1></div></header>
		<p className="track-count">{tracks.length} saved {tracks.length === 1 ? "track" : "tracks"}</p>
		<div className="track-library-tools"><button className="primary-button" onClick={onNew}>New Track</button><button ref={importButton} className="secondary-button" onClick={() => setImportOpen(true)}>Import Track</button></div>
		<section className="builtin-track" aria-label="Default track">
			<h2>Default Track</h2>
			<button className={!selectedTrackId ? "selected" : ""} aria-label={`${!selectedTrackId ? "Selected" : "Select"} Default Track`} aria-pressed={!selectedTrackId} onClick={() => onSelect(undefined)}>{!selectedTrackId ? "Selected" : "Select"}</button>
		</section>
		{sortedTracks.length === 0 ? <p className="empty-tracks">No saved tracks yet. Create one or import a track code.</p> : <ul className="track-list" aria-label="Saved tracks">{sortedTracks.map((track) => {
			const label = `${track.name || "Unnamed track"}, track ${track.id}`;
			const selected = track.id === selectedTrackId;
			return <li key={track.id} className={selected ? "selected-track" : ""}>
				<strong>{track.name || "Unnamed track"}</strong>
				<div className="track-actions">
					<button aria-label={`${selected ? "Selected" : "Select"} ${label}`} aria-pressed={selected} onClick={() => onSelect(track.id)}>{selected ? "Selected" : "Select"}</button>
					<button aria-label={`Edit ${label}`} onClick={() => onEdit(track.id)}>Edit</button>
					<button aria-label={`Play ${label}`} onClick={() => onPlay(track.id)}>Play</button>
					<button aria-label={`Share ${label}`} onClick={() => onShare(track.id)}>Share</button>
					<button aria-label={`Delete ${label}`} onClick={() => onDelete(track.id)}>Delete</button>
				</div>
			</li>;
		})}</ul>}
		{importOpen && <dialog ref={dialog} className="dialog-backdrop" aria-label="Import a track" onCancel={(event) => { event.preventDefault(); closeImport(); }} onClick={(event) => event.target === event.currentTarget && closeImport()}>
			<form className="share-dialog" onSubmit={(event) => { event.preventDefault(); const nextError = onImport(input); if (nextError) setError(nextError); else closeImport(); }}>
				<h2>Import Track</h2>
				<p>Paste a track code. You can review it before saving.</p>
				<label>Track code<textarea aria-label="Import track" value={input} onChange={(event) => setInput(event.target.value)} autoFocus /></label>
				{error && <p role="alert">{error}</p>}
				<div className="dialog-actions"><button type="submit" disabled={!input.trim()}>Import</button><button type="button" onClick={closeImport}>Cancel</button></div>
			</form>
		</dialog>}
	</section>;
}
