import { useEffect, useRef } from "react";

const cc0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const music = [
  { name: "Pure Raceway", author: "MintoDog", use: "Race music · 160 BPM / 175 BPM Climax · original recordings", source: "https://opengameart.org/content/pure-raceway", license: "CC0 1.0", licenseUrl: cc0 },
  { name: "Level finish fanfares", author: "Johan Brodd (jobromedia), 2014", use: "Results music · Open Surge score jingle — AAA · original recording", source: "https://opengameart.org/content/level-finish-fanfares", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/" },
  { name: "Voiceover Pack", author: "Kenney", use: "Ready, Go, Hurry up, Power up · original recordings", source: "https://kenney.nl/assets/voiceover-pack", license: "CC0 1.0", licenseUrl: cc0 },
  { name: "Impact Sounds", author: "Kenney", use: "Bumper, pinwheel and mogul impacts · original recordings", source: "https://kenney.nl/assets/impact-sounds", license: "CC0 1.0", licenseUrl: cc0 },
  { name: "Interface Sounds", author: "Kenney", use: "Menu, finish line, booster, DNF and timeout · DNF/timeout converted and normalized", source: "https://kenney.nl/assets/interface-sounds", license: "CC0 1.0", licenseUrl: cc0 },
];
const libraries = [
  { name: "React, React DOM & Scheduler", author: "Meta and contributors", source: "https://github.com/facebook/react", license: "MIT" },
  { name: "Three.js", author: "Three.js authors", source: "https://github.com/mrdoob/three.js", license: "MIT" },
  { name: "Rapier 3D", author: "Dimforge", source: "https://github.com/dimforge/rapier.js", license: "Apache-2.0" },
];

export function CreditsDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement; const current = dialog.current!;
    current.showModal();
    return () => { if (current.open) current.close(); if (opener instanceof HTMLElement) opener.focus(); };
  }, []);
  return <dialog ref={dialog} className="dialog-backdrop" aria-labelledby="credits-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="share-dialog credits-dialog">
      <header className="credits-header"><h2 id="credits-title">Credits</h2><button className="text-button" aria-label="Close credits" onClick={onClose}>Close</button></header>
      <p>Made possible by these creators and open-source communities. Thank you.</p>
      <h3>Music &amp; sound</h3>
      <ul>{music.map(item => <li key={item.name}><a href={item.source} target="_blank" rel="noreferrer">{item.name}</a><span>{item.author}</span><small>{item.use}</small><a className="credit-license" href={item.licenseUrl} target="_blank" rel="noreferrer">{item.license}</a></li>)}</ul>
      <p>Countdown beeps and the race victory fanfare are original synthesized Lucky Roll sounds.</p>
      <h3>Open-source software</h3>
      <ul>{libraries.map(item => <li key={item.name}><a href={item.source} target="_blank" rel="noreferrer">{item.name}</a><span>{item.author} · {item.license}</span></li>)}</ul>
      <a href="/licenses/OPEN-SOURCE.txt" target="_blank" rel="noreferrer">Full software license notices</a>
      <details><summary>Build &amp; test tools</summary><ul>{buildTools.map(item => <li key={item.name}><a href={item.source} target="_blank" rel="noreferrer">{item.name}</a><small>{item.license}</small></li>)}</ul></details>
    </section>
  </dialog>;
}

const buildTools = [
  {"name": "@cloudflare/vite-plugin", "source": "https://github.com/cloudflare/workers-sdk/tree/main/packages/vite-plugin-cloudflare#readme", "license": "MIT"},
  {"name": "@eslint/js", "source": "https://eslint.org", "license": "MIT"},
  {"name": "@testing-library/jest-dom", "source": "https://github.com/testing-library/jest-dom#readme", "license": "MIT"},
  {"name": "@testing-library/react", "source": "https://github.com/testing-library/react-testing-library#readme", "license": "MIT"},
  {"name": "@testing-library/user-event", "source": "https://github.com/testing-library/user-event#readme", "license": "MIT"},
  {"name": "@types/node", "source": "https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node", "license": "MIT"},
  {"name": "@types/react", "source": "https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react", "license": "MIT"},
  {"name": "@types/react-dom", "source": "https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom", "license": "MIT"},
  {"name": "@types/three", "source": "https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/three", "license": "MIT"},
  {"name": "@vitejs/plugin-react", "source": "https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#readme", "license": "MIT"},
  {"name": "eslint", "source": "https://eslint.org", "license": "MIT"},
  {"name": "eslint-plugin-react-hooks", "source": "https://react.dev/", "license": "MIT"},
  {"name": "eslint-plugin-react-refresh", "source": "https://www.npmjs.com/package/eslint-plugin-react-refresh", "license": "MIT"},
  {"name": "globals", "source": "https://www.npmjs.com/package/globals", "license": "MIT"},
  {"name": "jsdom", "source": "https://www.npmjs.com/package/jsdom", "license": "MIT"},
  {"name": "typescript", "source": "https://www.typescriptlang.org/", "license": "Apache-2.0"},
  {"name": "typescript-eslint", "source": "https://typescript-eslint.io/packages/typescript-eslint", "license": "MIT"},
  {"name": "vite", "source": "https://vite.dev", "license": "MIT"},
  {"name": "vitest", "source": "https://github.com/vitest-dev/vitest#readme", "license": "MIT"},
  {"name": "wrangler", "source": "https://github.com/cloudflare/workers-sdk#readme", "license": "MIT OR Apache-2.0"},
];
