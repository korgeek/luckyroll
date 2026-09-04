import type { ReactElement } from "react";
import type { TrackCell, Direction, ModuleKind } from "../designer/trackDesign";
import { portsFor } from "../designer/trackDesign";

const POINTS: Readonly<Record<Direction, readonly [number, number]>> = { north: [50, 0], east: [100, 50], south: [50, 100], west: [0, 50] };
const GLYPHS: Readonly<Record<ModuleKind, string>> = { straight: "", curve: "", funnel: "⌄", wave: "≈", pinwheel: "✣", booster: "»", bumper: "●" };

export function TrackCellDiagram({ cell }: { cell: Exclude<TrackCell, null> }): ReactElement {
	const ports = portsFor(cell);
	const d = ports.length === 2
		? ((ports.includes("north") && ports.includes("south")) || (ports.includes("east") && ports.includes("west"))
			? `M ${POINTS[ports[0]].join(" ")} L ${POINTS[ports[1]].join(" ")}`
			: `M ${POINTS[ports[0]].join(" ")} Q 50 50 ${POINTS[ports[1]].join(" ")}`)
		: ports.map((port) => `M 50 50 L ${POINTS[port].join(" ")}`).join(" ");
	return <svg className="track-cell-diagram" viewBox="0 0 100 100" aria-hidden="true">
		{d && <path d={d} />}
		{ports.map((port) => <circle key={port} cx={POINTS[port][0]} cy={POINTS[port][1]} r="4" data-port={port} />)}
		{cell.kind === "start" && <text x="50" y="56">START</text>}
		{cell.kind === "finish" && <text x="50" y="56">FINISH</text>}
		{cell.kind !== "start" && cell.kind !== "finish" && GLYPHS[cell.kind] && <text x="50" y="56">{GLYPHS[cell.kind]}</text>}
	</svg>;
}
