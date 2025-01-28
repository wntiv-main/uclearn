import { loadPage } from "./page-loader";

let _jQuery: unknown = undefined;
Object.defineProperty(window, "jQuery", {
	get: () => _jQuery,
	set(v) { _jQuery = v ?? _jQuery; }
});

loadPage();
