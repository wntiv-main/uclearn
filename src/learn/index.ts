import { initialPageLoad, initNavigator } from "./navigation";
import { Toast } from "./lib-hook";
import { DEBUG } from "../global/constants";
import { patchAceEditor } from "./ace-patches";
import type MathJax from 'mathjax';
import { initKeybindings } from "./keybindings";
import { initConfig } from "./config";
import { initMessaging } from "./messaging";
import { initQuizWorkspace } from "./workspace-ui";

if (DEBUG) window.addEventListener("error", async (e) => {
	(await Toast).add(e.message, { title: `ERROR in '${e.filename}':`, type: 'danger' });
});

declare module 'mathjax' {
	const AuthorConfig: Config;
}

let _MathJax: typeof MathJax | null = null;
Object.defineProperty(window, 'MathJax', {
	get: () => _MathJax,
	set(v: Partial<typeof MathJax & MathJax.Config>) {
		if (!_MathJax || v.AuthorConfig) {
			_MathJax = v as typeof MathJax;
			return;
		}
		_MathJax.Hub.Config(v as MathJax.Config);
	}
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

initQuizWorkspace();
initMessaging();
initConfig();
patchAceEditor();
initialPageLoad();
initNavigator();
initKeybindings();

const nav = document.querySelector('nav.navbar');
if (nav) {
	const observer = new ResizeObserver((es) => {
		for (const evt of es)
			document.documentElement.style.setProperty("--uclearn-nav-height", `${evt.contentRect.height}px`);
	});
	observer.observe(nav);
}
