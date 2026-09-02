/// <reference types="vite/client" />

declare module "@dimforge/rapier3d-compat/rapier.es.js" {
  const rapier: typeof import("@dimforge/rapier3d-compat");
  export default rapier;
}
