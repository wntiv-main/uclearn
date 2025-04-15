import { initialPageLoad, initNavigator } from "./navigation";
import { Toast } from "./patches/lib-hook";
import { DEBUG } from "../global/constants";
import { patchAceEditor } from "./patches/ace-patches";
import type MathJax from 'mathjax';
import { initKeybindings } from "./keybindings";
import { initConfig } from "./config";
import { initMessaging } from "./messaging";
import { initQuizWorkspace } from "./workspace-ui";
import { initHLJS } from "./patches/highlightjs-patches";
import { initTheme } from "./theme";
import { patchJSXGraph } from "./patches/jsxgraph-patches";

if (DEBUG) window.addEventListener("error", async (e) => {
	(await Toast).add(e.message, { title: `ERROR in '${e.filename}':`, type: 'danger' });
});

declare module 'mathjax' {
	const AuthorConfig: Config;

	interface Config {
		AuthorInit?(): void;
	}
}

let _MathJax: typeof MathJax | null = null;
const onReady: ((mj: typeof MathJax) => unknown)[] = [];
Object.defineProperty(window, 'MathJax', {
	get: () => _MathJax,
	set(v: typeof MathJax | MathJax.Config | null) {
		if (!_MathJax || (v && 'AuthorConfig' in v)) {
			_MathJax = v as typeof MathJax;
			while (onReady.length) {
				// biome-ignore lint/style/noNonNullAssertion: length check above
				onReady.pop()!(_MathJax);
			}
			return;
		}
		if (_MathJax?.Hub?.Config) {
			_MathJax.Hub?.Config(v as MathJax.Config);
			v?.AuthorInit?.();
		} else {
			onReady.push(mj => {
				mj.Hub.Config(v as MathJax.Config);
				v?.AuthorInit?.();
			});
		}
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
initTheme();
initConfig();
patchAceEditor();
patchJSXGraph();
initialPageLoad();
initNavigator();
initKeybindings();
initHLJS();

const nav = document.querySelector('nav.navbar');
if (nav) {
	const observer = new ResizeObserver((es) => {
		for (const evt of es)
			document.documentElement.style.setProperty("--uclearn-nav-height", `${evt.contentRect.height}px`);
	});
	observer.observe(nav);
}
