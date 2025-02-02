import { initNavigator } from "./navigation";
import { Toast } from "./lib-hook";
import { loadPage } from "./page-loader";
import { DEBUG } from "./global/constants";
import { patchAceEditor } from "./monaco-loader";

if (DEBUG) window.addEventListener("error", async (e) => {
	(await Toast).add(e.message, { title: `ERROR in '${e.filename}':`, type: 'danger' });
});

// Fix bug with jquery plugins
let _jQuery: unknown = undefined;
Object.defineProperty(window, "jQuery", {
	get: () => _jQuery,
	set(v) { _jQuery = v ?? _jQuery; }
});
let _$: unknown = undefined;
Object.defineProperty(window, "$", {
	get: () => _$,
	set(v) { _$ = v ?? _$; }
});

patchAceEditor();
loadPage();
initNavigator();
