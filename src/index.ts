import { initHydration } from "./hydration";
import { loadPage } from "./page-loader";

// Fix bug with jquery plugins
let _jQuery: unknown = undefined;
Object.defineProperty(window, "jQuery", {
	get: () => _jQuery,
	set(v) { _jQuery = v ?? _jQuery; }
});

loadPage();
initHydration();
