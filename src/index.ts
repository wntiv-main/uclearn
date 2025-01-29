import { initHydration } from "./hydration";
import { Toast } from "./lib-hook";
import { loadPage } from "./page-loader";

window.addEventListener("error", async (e) => {
	(await Toast).add(e.message, { title: `ERROR in '${e.filename}':`, type: 'danger' });
});

// Fix bug with jquery plugins
let _jQuery: unknown = undefined;
Object.defineProperty(window, "jQuery", {
	get: () => _jQuery,
	set(v) { _jQuery = v ?? _jQuery; }
});

loadPage();
initHydration();
