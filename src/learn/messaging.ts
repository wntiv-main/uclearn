import { sanitize } from 'dompurify';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { isElement } from './domutil';
import hljs from 'highlight.js';
import { EXT_URL } from './constants';
import { onNodeInsert } from './hydration';


let marked: Marked | null = null;
async function markMessage(msg: HTMLElement) {
	marked ??= new Marked(markedHighlight({
		highlight(code, lang) {
			const language = hljs.getLanguage(lang) ? lang : 'plaintext';
			return hljs.highlight(code, { language }).value;
		},
	}));
	const node = msg.querySelector<HTMLElement>('[data-region="text-container"]');
	if (!node) return;
	const content = sanitize(await marked.parse(node.innerText, {
		async: true,
		gfm: true,
		breaks: true,
	}), { RETURN_DOM_FRAGMENT: true });
	const styles = document.createElement('style');
	styles.innerHTML = `
	:is(p, pre, blockquote) {
		margin-block: 0.5em;

		style:first-child + link + &, &:first-child {
			margin-top: 0;
		}

		&:last-child {
			margin-bottom: 0;
		}
	}
		
	blockquote {
		margin-inline: 0;
		padding-inline: 0.25ch;
		border-radius: 0.25ch 0 0 0.25ch;
		border-left: 0.25ch solid var(--uclearn-background);
	}`;
	const hljsTheme = document.createElement('link');
	hljsTheme.rel = 'stylesheet';
	hljsTheme.href = `${EXT_URL}/learn/highlight.js/vs2015.min.css`;
	node.attachShadow({
		mode: 'closed',
		serializable: false,
	}).append(styles, hljsTheme, content);
}

function initMessageApp(root: HTMLElement) {
	const messageContainer = root.querySelector('.content-message-container');
	if (!messageContainer) return;
	const observer = new MutationObserver(es => {
		for (const e of es) {
			for (const el of e.addedNodes) {
				if (!isElement(el)) continue;
				if (el.classList.contains('message'))
					markMessage(el as HTMLElement);
				else for (const msg of el.getElementsByClassName('message')) {
					markMessage(msg as HTMLElement);
				}
			}
		}
	});
	observer.observe(messageContainer, {
		childList: true,
		subtree: true,
	});
}

export function initMessaging() {
	onNodeInsert(null, '.message-app', el => initMessageApp(el));
}
