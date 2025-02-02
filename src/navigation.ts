import type VideoJS from 'video.js';
import type { YUI } from 'yui';

import { DEBUG } from './global/constants';
import { type HydrationConfig, type HydrationProgressCallback, HydrationStage } from "./global/hydration";
import { update } from './global/util';
import { hydrate, SKIP_HYDRATION_CLASS } from './hydration';
import { getYUIInstance, initAce, modals, Toast, videoJS } from './lib-hook';

let vjs: typeof VideoJS;

type HydrationHint = [
	| string
	| [
		string,
		(
			el: HTMLElement,
			updatedDom: Document,
		) => HTMLElement | null | undefined,
	],
	...[Partial<HydrationConfig>] | []
];

const parser = new DOMParser();
async function hydrateFromResponse(resp: Response, content: string, hydrationHints: HydrationHint[] = [], onProgress?: HydrationProgressCallback) {
	const startTime = performance.now();
	console.time('hydration-parsing');
	const contentType = resp.headers.get("Content-Type")?.split(";")[0] ?? 'text/html';
	if (!contentType.includes("html")) {
		// We shoudln't handle this, load page normally
		location.replace(resp.url);
		return; // needed for typescript
	}
	onProgress?.(HydrationStage.PARSING, 0);
	const updated = parser.parseFromString(
		content,
		contentType as DOMParserSupportedType,
	);
	onProgress?.(HydrationStage.PARSING, 1);
	if (new URL(resp.url).pathname !== location.pathname) (window as { setupDone?: boolean; }).setupDone = false;
	console.log(updated);
	let needsCourseIndexRefresh = false;
	for (const script of updated.querySelectorAll('script')) {
		if (!/^\s*(\/\/.*)?\s*var\s*M/.test(script.text)) continue;
		const oldConfig = window.YUI_config;
		// Eval script
		const [M, YUI_config]: [typeof window.M, Parameters<YUI['applyConfig']>[0]] = new Function(`${script.text};return [M, YUI_config];`)();
		(await getYUIInstance()).applyConfig(YUI_config);
		console.log('updated YUI config to', YUI_config, 'from', oldConfig);
		console.log('updated Moodle state with', M, 'from', update({ cfg: {} }, window.M));
		needsCourseIndexRefresh ||= window.M?.cfg?.courseId !== M?.cfg?.courseId;
		window.M = update(window.M ?? {}, M);
		break;
	}
	console.timeEnd('hydration-parsing');
	console.time('hydration');
	const elPairs: [string, HTMLElement, HTMLElement, Partial<HydrationConfig>][] = [];
	for (const [selector, config = {}] of hydrationHints) {
		if (typeof selector === 'string') {
			const current = document.querySelectorAll(selector);
			const other = updated.querySelectorAll(selector);
			if (current.length !== 1 || other.length !== 1) {
				if (DEBUG) {
					console.warn(
						"Hydration hint",
						selector,
						"failed to locate unique elements, found",
						current,
						other,
					);
					(await Toast).add(
						`Hydration hint '${selector}' failed, selecting (${current.length}, ${other.length}) nodes`,
						{ type: "warning" },
					);
				}
				elPairs.splice(0, elPairs.length);
				break;
			}
			elPairs.push([
				selector,
				current[0] as HTMLElement,
				other[0] as HTMLElement,
				config,
			]);
		} else {
			const [sel, mapper] = selector;
			const els = document.querySelectorAll<HTMLElement>(sel);
			for (let i = 0; i < els.length; i++) {
				const current = els[i];
				const other = mapper(current, updated);
				if (!other) {
					console.warn(
						"Hydration hint",
						selector,
						"failed to find element for",
						current
					);
					continue;
				}
				const uid = current.id.replace(/^yui_.*/, "") || current.getAttribute('name') || `${current.classList}(${i})`;
				elPairs.push([`${sel}:${uid}`, current, other, config]);
			}
		}
	}
	if (!elPairs.length) elPairs.push([':root',
		document.getElementById('page-wrapper') ?? document.body,
		updated.getElementById('page-wrapper') ?? updated.body, {}]);
	for (const [name, left, right, config] of elPairs)
		await hydrate(left, right, { nameHint: name, needsCourseIndexRefresh, onProgress, ...config });
	console.timeEnd('hydration');
	// Quiz timer needs restart
	try { window.M?.mod_quiz?.timer?.update(); } catch (e) { console.warn(e); }
	window.aceInlineCodeHighlightingDone &&= false;
	window.aceInlineCodeInteractiveDone &&= false;
	(await initAce).initAceHighlighting({});
	(await initAce).initAceInteractive({ button_label: "Try it!" });
	document.querySelector("#mod_quiz_navblock .thispage")?.scrollIntoView({
		behavior: 'smooth',
		block: 'center',
	});
	onProgress?.(HydrationStage.CLOSE, 0);
	if (DEBUG) (await Toast).add(`Hydration in ${((performance.now() - startTime) / 1000).toFixed(2)}s`, { type: 'success' });
}

async function safeFetch(input: RequestInfo | URL, { onProgress, onError, ...init }: RequestInit & {
	onProgress?: (loaded: number, total: number) => void;
	onError?: (err: Error) => void;
} = {}) {
	const resp = await fetch(input, init)
		.then((resp) => {
			if (!resp.ok)
				throw new Error(
					`Server responded with ${resp.status}: ${resp.statusText}`,
				);
			return resp;
		})
		.catch(async (err: Error) => {
			const [ModalRegistry, ModalEvents] = await modals;
			const modal = await ModalRegistry.get('SAVE_CANCEL').module.create({
				title: `Error: Failed to open '${typeof input === 'string' ? input : input instanceof Request ? input.url : input.href}'`,
				body: err.message,
				buttons: { save: 'Follow link anyway', cancel: 'Remain here' },
				removeOnClose: true,
			});
			modal.getRoot().on(ModalEvents.save, () => location.assign(input instanceof Request ? input.url : input));
			modal.show();
			onError?.(err);
			throw err;
		});
	const charset = (resp.headers.get('Content-Type') ?? '').match(/charset=([^\s;]*)/)?.[1] ?? 'utf-8';
	const total = Number.parseInt(resp.headers.get('Content-Length') ?? '');
	let loaded = 0;
	const data = new TextDecoderStream(charset, { fatal: true, ignoreBOM: false });
	const writeData = data.writable.getWriter();

	// biome-ignore lint/style/noNonNullAssertion: response must have body here
	const reader = resp.body!.getReader();
	const strReader = data.readable.getReader();
	let readerDone = false;
	let content = '';
	while (true) {
		if (!readerDone) {
			const { done, value } = await reader.read();
			if (done) {
				writeData.close();
				readerDone = true;
			} else {
				writeData.write(value);
				loaded += value.byteLength;
				onProgress?.(loaded, total);
			}
		}
		const { done, value } = await strReader.read();
		if (done) break;
		content += value ?? '';
	}
	return [resp, content] as const;
}

// async function safeFetch(url: string | URL, options?: {
// 	method?: "GET" | 'POST',
// 	body?: XMLHttpRequestBodyInit,
// 	onProgress?(loaded: number, total: number | null): void;
// 	onError?(e: Error): void;
// }) {
// 	try {
// 		const req = new XMLHttpRequest();
// 		req.open(options?.method ?? 'GET', url as string | URL);
// 		req.addEventListener("progress", e => {
// 			options?.onProgress?.(e.loaded, e.lengthComputable ? e.total : null);
// 		});
// 		await new Promise<void>((res) => {
// 			req.addEventListener("readystatechange", (e) => {
// 				if (req.readyState === req.DONE) res();
// 			});
// 			req.send(options?.body);
// 		});
// 		if (req.status < 200 || req.status >= 400)
// 			throw new Error(
// 				`Server responded with ${req.status}: ${req.statusText}`);
// 		return req;
// 	} catch (e) {
// 		const [ModalRegistry, ModalEvents] = await modals;
// 		const modal = await ModalRegistry.get('SAVE_CANCEL').module.create({
// 			title: `Error: Failed to open '${typeof url === 'string' ? url : url.href}'`,
// 			body: (e as Error).message,
// 			buttons: { save: 'Follow link anyway', cancel: 'Remain here' },
// 			removeOnClose: true,
// 		});
// 		modal.getRoot().on(ModalEvents.save, () => location.assign(url));
// 		modal.show();
// 		options?.onError?.(e as Error);
// 		throw e;
// 	}
// }

let loadingEl: HTMLElement | null = null;
const stageWidths: Record<HydrationStage, number> = {
	[HydrationStage.FETCHING]: 0.1,
	[HydrationStage.PARSING]: 0.1,
	[HydrationStage.HYDRATING]: 0.4,
	[HydrationStage.APPLYING]: 0.4,
	[HydrationStage.CLOSE]: 0,
};
function updateProgress(stage: HydrationStage, percentage: number) {
	loadingEl ??= (() => {
		const el = document.createElement('div');
		el.id = "uclearn-loading-progress";
		el.classList.add(SKIP_HYDRATION_CLASS);
		el.ariaLabel = "Page loading progress";
		el.role = "progressbar";
		document.body.append(el);
		return el;
	})();
	let totalProgress = 0;
	if (stage > HydrationStage.FETCHING)
		totalProgress += stageWidths[HydrationStage.FETCHING];
	if (stage > HydrationStage.PARSING)
		totalProgress += stageWidths[HydrationStage.PARSING];
	if (stage > HydrationStage.HYDRATING)
		totalProgress += stageWidths[HydrationStage.HYDRATING];
	if (stage > HydrationStage.APPLYING)
		totalProgress += stageWidths[HydrationStage.APPLYING];
	if (stage >= HydrationStage.CLOSE) {
		setTimeout(() => {
			if (loadingEl) loadingEl.style.width = '0';
		}, 300);
		return;
	}
	loadingEl.ariaValueNow = `${100 * (totalProgress + percentage * stageWidths[stage])}`;
	loadingEl.style.width = `${100 * (totalProgress + percentage * stageWidths[stage])}%`;
}

export async function initNavigator() {
	vjs = await videoJS;
	window.addEventListener(
		"submit",
		async (e) => {
			const form = e.target;
			console.log(e.submitter);
			if (!(form instanceof HTMLFormElement)) return;
			if (form.method === 'dialog') return;
			e.preventDefault();
			const [resp, content] = await safeFetch(form.action, {
				method: "POST",
				body: new FormData(form, e.submitter),
				onProgress: (loaded, total) =>
					total && updateProgress(HydrationStage.FETCHING, loaded / total),
				onError: () =>
					updateProgress(HydrationStage.CLOSE, 0),
			});
			const scrollPos = document.getElementById("page")?.scrollTop;
			if (!e.submitter?.classList.contains('submit'))
				document.getElementById("page")?.scrollTo(0, 0);
			const toHydrate: HydrationHint[] = [];
			if (e.submitter?.classList.contains('submit')) {
				const question = e.submitter.closest('.que');
				if (question?.id) {
					toHydrate.push(["#mod_quiz_navblock", { updateUpTree: true }]);
					toHydrate.push([`#${question.id}`, { updateUpTree: true }]);
					toHydrate.push(["#responseform .submitbtns"]);
					toHydrate.push([[
						'#responseform>*>input[type="hidden"], #responseform input[name*="sequencecheck"]',
						(el, dom) =>
							dom.getElementsByName(el.getAttribute("name") ?? "never")[0],
					], { evadeDebugging: true }]);
				}
			}
			if (e.submitter?.classList.contains('mod_quiz-next-nav') || e.submitter?.classList.contains('mod_quiz-prev-nav')) {
				toHydrate.push(['#mod_quiz_navblock', { updateUpTree: true }]);
				toHydrate.push(['#region-main', { updateUpTree: true }]);
				toHydrate.push(['#page-footer']);
			}
			await hydrateFromResponse(resp, content, toHydrate, updateProgress);
			const newLocation = new URL(resp.url);
			const oldSearch = new URLSearchParams(location.search);
			let searchesMatch = true;
			for (const key of new Set([
				...oldSearch.keys(),
				...newLocation.searchParams.keys(),
			])) {
				if (oldSearch.get(key) !== newLocation.searchParams.get(key)) {
					searchesMatch = false;
					break;
				}
			}
			if (location.pathname !== newLocation.pathname || !searchesMatch)
				history.pushState({ scrollPos }, "", resp.url);
		}
	);

	window.addEventListener("click", async (e) => {
		if (e.defaultPrevented || e.ctrlKey) return;
		if (e.ctrlKey) return;
		const link = (e.target as Element).closest("a");
		if (!link || !link.href || /^(java|live|vb)script:|^#/.test(link.href)) return;
		if (link.target === '_blank') return;
		const target = new URL(link.href);
		if (target.origin !== location.origin) return; // Cross-origin
		if (/\.(?!x?html?|php)\w+$/i.test(target.pathname)) return; // not html
		e.preventDefault();
		const [resp, content] = await safeFetch(link.href, {
			method: "GET",
			onProgress: (loaded, total) =>
				total && updateProgress(HydrationStage.FETCHING, loaded / total),
			onError: () =>
				updateProgress(HydrationStage.CLOSE, 0),
		});
		const scrollPos = document.getElementById("page")?.scrollTop;
		document.getElementById("page")?.scrollTo(0, 0);
		const toHydrate: HydrationHint[] = [];
		if (link.id.startsWith('quiznavbutton')
			|| link.classList.contains('mod_quiz-next-nav')
			|| link.classList.contains('mod_quiz-prev-nav')) {
			toHydrate.push(['#mod_quiz_navblock', { updateUpTree: true }]);
			toHydrate.push(['#region-main', { updateUpTree: true }]);
			toHydrate.push(['#page-footer']);
		}
		await hydrateFromResponse(resp, content, toHydrate, updateProgress);
		const newLocation = new URL(resp.url);
		const oldSearch = new URLSearchParams(location.search);
		let searchesMatch = true;
		for (const key of new Set([
			...oldSearch.keys(),
			...newLocation.searchParams.keys(),
		])) {
			if (oldSearch.get(key) !== newLocation.searchParams.get(key)) {
				searchesMatch = false;
				break;
			}
		}
		const targetEl = newLocation.hash && document.querySelector(newLocation.hash);
		if (targetEl) targetEl.scrollIntoView({ behavior: 'instant', block: 'start' });
		if (location.pathname !== newLocation.pathname || !searchesMatch)
			history.pushState({ scrollPos }, "", resp.url);
	});

	window.addEventListener("popstate", async (e) => {
		const [resp, content] = await safeFetch(location.href, {
			method: "GET",
			onProgress: (loaded, total) =>
				total && updateProgress(HydrationStage.FETCHING, loaded / total),
			onError: () =>
				updateProgress(HydrationStage.CLOSE, 0),
		});
		await hydrateFromResponse(resp, content, [], updateProgress);
		if (e.state?.scrollPos) {
			document.getElementById("page")?.scrollTo(0, e.state.scrollPos);
		}
	});
}
