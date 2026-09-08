import { useEffect, useRef, useState } from "react";
import { encodeSharedTrack } from "../designer/trackCodec";
import type { TrackDesign } from "../designer/trackDesign";

export type ShareTrackDialogProps = Readonly<{
	track: TrackDesign;
	writeText: ((text: string) => Promise<void>) | undefined;
	onClose: () => void;
}>;

export function ShareTrackDialog({ track, writeText, onClose }: ShareTrackDialogProps) {
	const [status, setStatus] = useState("");
	const dialog = useRef<HTMLDialogElement>(null);
	const code = encodeSharedTrack(track);
	useEffect(() => {
		if (!dialog.current) return;
		const current = dialog.current;
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
		current.showModal();
		return () => { if (current.open) current.close(); opener?.focus(); };
	}, []);
	const copy = async () => {
		try {
			if (!writeText) throw new Error("Clipboard unavailable");
			await writeText(code);
			setStatus("Track code copied.");
		} catch { setStatus("Could not copy automatically. Select the code and copy it manually."); }
	};
	return <dialog ref={dialog} className="dialog-backdrop" aria-label={`Share ${track.name}`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => event.target === event.currentTarget && onClose()}>
		<section className="share-dialog">
			<h2>Share {track.name}</h2>
			<p>Send this code to another player.</p>
			<label>Track code<textarea aria-label="Track code" readOnly value={code} onFocus={(event) => event.currentTarget.select()} /></label>
			<p role="status" aria-live="polite">{status}</p>
			<div className="dialog-actions"><button onClick={copy}>Copy code</button><button onClick={onClose}>Close</button></div>
		</section>
	</dialog>;
}
