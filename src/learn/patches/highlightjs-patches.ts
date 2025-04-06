import { DEBUG } from "../../global/constants";
import { EXT_URL } from "../constants";
import { HIDDEN_CLS, SKIP_UPDATE_CLASS } from "../hydration";

let hljsStyles: string | null = null;

function updateStyle(node: HTMLStyleElement) {
	node.textContent = hljsStyles;
}

export function updateHLJSStyles(css: string) {
	hljsStyles = css;
	for (const style of document.getElementsByClassName(`${HIDDEN_CLS}-hljs-style`)) {
		updateStyle(style as HTMLStyleElement);
	}
}

export function initHLJS() {
	let _hljs: unknown;
	Object.defineProperty(window, 'hljs', {
		get: () => _hljs,
		set(v) {
			fetch(`${EXT_URL}/learn/highlight.js/vs2015.min.css`).then(async resp => {
				updateHLJSStyles(await resp.text());
			});

			_hljs = v;

			for (const style of document.querySelectorAll('style')) {
				if (!style.textContent?.includes('hljs')) continue;
				if (DEBUG) console.log('Replacing HLJS styles at', style, 'was', { old: style.textContent });
				style.classList.add(SKIP_UPDATE_CLASS, `${HIDDEN_CLS}-hljs-style`);
				if (hljsStyles) updateStyle(style);
			}
		}
	});
}
