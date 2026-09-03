import { useState } from "react";
import { createShareUrl } from "../designer/trackCodec";
import type { TrackDesign } from "../designer/trackDesign";

export type ShareTrackDialogProps = Readonly<{
	track: TrackDesign;
	baseHref: string;
	share: ((data: ShareData) => Promise<void>) | undefined;
	writeText: ((text: string) => Promise<void>) | undefined;
	onImport: (input: string) => void;
	onClose: () => void;
}>;

export function ShareTrackDialog({ track, baseHref, share, writeText, onImport, onClose }: ShareTrackDialogProps) {
	const [importInput, setImportInput] = useState("");
	const [status, setStatus] = useState("");
	const { token, url } = createShareUrl(track, baseHref);
	const shareTrack = async () => {
		try {
			if (share) await share({ title: track.name, text: url, url });
			else if (writeText) await writeText(url);
			else throw new Error("Sharing is unavailable.");
			setStatus("Track link copied or shared.");
		} catch {
			setStatus("Could not share automatically. Select and copy the link or token.");
		}
	};
	return <section className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={`Share ${track.name}`}>
		<div className="share-dialog">
			<h2>Share {track.name}</h2>
			<label>Share link<input aria-label="Share link" readOnly value={url} onFocus={(event) => event.currentTarget.select()} /></label>
			<label>Share token<input aria-label="Share token" readOnly value={token} onFocus={(event) => event.currentTarget.select()} /></label>
			<p role="status" aria-live="polite">{status}</p>
			<div className="dialog-actions"><button onClick={shareTrack}>Share</button><button onClick={onClose}>Close</button></div>
			<form className="track-import" onSubmit={(event) => { event.preventDefault(); onImport(importInput); }}>
				<label>Import track<input aria-label="Import track" value={importInput} onChange={(event) => setImportInput(event.target.value)} /></label>
				<button type="submit">Import</button>
			</form>
		</div>
	</section>;
}
