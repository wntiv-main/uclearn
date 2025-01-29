import { DEBUG, DEBUG_HYDRATION, DEBUG_SCRIPTING } from './contants';
import { Hirschberg } from './hirschberg';
import { getYUIInstance, ModalEvents, ModalFactory, Toast, videoJS } from './lib-hook';
import type VideoJS from 'video.js';
import type MathJax from 'mathjax';
// import { initField } from './mathquill-loader';
import { assertNever, compareClasses, isElement, update } from './util';
import { DOMInspector } from './dominspect';
import type { YUI } from 'yui';

let vjs: typeof VideoJS;

type MathJaxProvider = typeof window & {
	MathJax: typeof MathJax;
};

function similarClasses(classListA: DOMTokenList, classListB: DOMTokenList) {
	if (!classListA.length) return true;
	for (const cls of classListA) {
		if (classListB.contains(cls)) return true;
	}
	return false;
}

type VideoJSElement = HTMLElement & { player: VideoJS.Player; };
function asyncTimeout(delay: number) {
	return new Promise(resolve => setTimeout(resolve, delay));
}

enum ChildType {
	HTML = 0,
	TEXT = 1,
	OTHER = 3,
}
enum HTMLChildType {
	NORMAL = 0,
	SCRIPT = 1,
	VIDEOJS = 2,
}
enum TextChildType {
	NORMAL = 0,
	MATH = 1,
	MATH_TEXT = 2,
}
type Child = ({
	type: ChildType.HTML,
	node: Element,
	tag: string,
	id: string,
	classes: DOMTokenList,
} & ({
	nodeType: HTMLChildType.NORMAL,
} | {
	nodeType: HTMLChildType.VIDEOJS,
	sources: string[],
} | {
	node: HTMLScriptElement,
	nodeType: HTMLChildType.SCRIPT,
	data: string,
}) | ({
	type: ChildType.TEXT,
	data: string,
} & ({
	textType: TextChildType.NORMAL,
	node: Text,
} | {
	textType: TextChildType.MATH,
	node: Element[],
} | {
	textType: TextChildType.MATH_TEXT,
	node: Text,
})) | {
	type: ChildType.OTHER,
	node: Node,
});

function compare(a: Child, b: Child) {
	if (a.type !== b.type) return false;
	switch (a.type) {
		case ChildType.HTML: {
			if (a.nodeType === HTMLChildType.VIDEOJS && (b as typeof a).nodeType === HTMLChildType.VIDEOJS) {
				for (const aSrc of a.sources) {
					for (const bSrc of (b as typeof a).sources) {
						if (aSrc === bSrc) return true;
					}
				}
			}
			if (a.tag !== (b as typeof a).tag
				|| a.id !== (b as typeof a).id) return false;
			if (a.nodeType === HTMLChildType.SCRIPT
				&& a.data !== (b as typeof a).data) return false;
			return similarClasses(a.classes, (b as typeof a).classes);
		}
		case ChildType.TEXT: return a.data === (b as typeof a).data;
		case ChildType.OTHER: return false;
	}
}

const ID_RGX = /^((?:\w+-)+)(?:[0-9a-fA-F]{28}|[0-9a-fA-F]{13})((?:-\w+)*)$|^(single_button)[0-9a-fA-F]{15}$|^yui_.*$|^(url_select_).*$/;
function precomputeCompare(el: Node): Child | Child[] {
	if (el.nodeType === Node.COMMENT_NODE || (el as { classList?: DOMTokenList; }).classList?.contains('__uclearn-hydrate-remove')) return [];
	if (isElement(el)) {
		if (el.matches('.MathJax_Preview:has(+ .MathJax + script[type^="math/"]), .MathJax:has(+ script[type^="math/"])')
			|| el.classList.contains('uclearn-mathquillField')) return [];

		if (el.matches('.MathJax + script[type^="math/"]')) {
			const nodes = [];
			const jax = el.previousElementSibling;
			const preview = jax?.previousElementSibling;
			if (preview?.classList.contains('MathJax_Preview')) nodes.push(preview);
			if (jax?.classList.contains('MathJax')) nodes.push(jax);
			nodes.push(el);
			return {
				type: ChildType.TEXT,
				textType: TextChildType.MATH,
				data: el.textContent ?? '',
				node: nodes,
			} satisfies Child;
		}

		return {
			type: ChildType.HTML,
			node: el as HTMLElement & HTMLScriptElement, // shut typescript
			tag: el.tagName,
			id: (typeof el.id === 'string' ? el.id : el.getAttribute('id') ?? '').replace(ID_RGX, '$1$2'),
			classes: el.classList,
			...(el.classList.contains('video-js') ? {
				nodeType: HTMLChildType.VIDEOJS,
				sources: 'player' in el ? (el as VideoJSElement).player.currentSources() : vjs.getComponent("Player").getTagSettings(el).sources,
			} : el instanceof HTMLScriptElement ? { nodeType: HTMLChildType.SCRIPT, data: el.src || el.text, }
				: { nodeType: HTMLChildType.NORMAL, })
		} satisfies Child;
	}
	if (el instanceof Text) {
		if (el.parentElement?.closest(".filter_mathjaxloader_equation")) {
			const math = /\$(.+?)\$|\\\((.+?)\\\)/g;
			return el.data
				.split(math)
				.filter(x => x !== undefined)
				.flatMap((str, i) => {
					if (!str) return [];
					const node = el.ownerDocument.createTextNode(str);
					return {
						type: ChildType.TEXT,
						node,
						data: str,
						textType: i % 2 ? TextChildType.MATH_TEXT : TextChildType.NORMAL,
					} satisfies Child;
				});
		}
		return {
			type: ChildType.TEXT,
			node: el,
			data: el.data,
			textType: TextChildType.NORMAL,
		} satisfies Child;
	}
	return {
		type: ChildType.OTHER,
		node: el,
	} satisfies Child;
}

const _MathJaxOld = (window as MathJaxProvider).MathJax;
let _MathJax: typeof MathJax & { isReady?: boolean; };
let _MathJax_Ready = false;
const _MathJaxReadyCallbacks: ((mj: typeof MathJax) => void)[] = [];
Object.defineProperty(window, "MathJax", {
	get() {
		return _MathJax;
	},
	set(value) {
		_MathJax_Ready = false;
		_MathJax = value;
		console.log("Got MathJax", value);
		if (typeof _MathJax !== "object") return;
		const _MathJax_ReadyOld = _MathJax.isReady;
		Object.defineProperty(_MathJax, "isReady", {
			get() {
				return _MathJax_Ready;
			},
			async set(value) {
				_MathJax_Ready = value;
				console.log("Got MathJax.isReady", value);
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				while (_MathJaxReadyCallbacks.length) _MathJaxReadyCallbacks.pop()!(_MathJax);
			},
		});
		if (_MathJax_ReadyOld !== undefined)
			_MathJax.isReady = _MathJax_ReadyOld;
	},
});
if (_MathJaxOld !== undefined)
	window.MathJax = _MathJaxOld;
async function mathJaxReady() {
	if (_MathJax_Ready) return window.MathJax;
	return await new Promise<typeof MathJax>(res => _MathJax_Ready ? res(window.MathJax) : _MathJaxReadyCallbacks.push(res));
}

const SAFE_ATTRS = /^id$|^class$|^data-uclearn/;

type Hydration = {
	config: { needsCourseIndexRefresh?: boolean; };
	tasks: ({ debug?: boolean; } & ({
		type: 'setAttr',
		element: Element,
		attr: string,
		value: string,
	} | {
		type: 'delAttr',
		element: Element,
		attr: string,
	} | {
		type: 'updateContent',
		element: Text,
		text: string,
	} | {
		type: 'remove',
		element: ChildNode,
	} | {
		type: 'insert',
		parent: Node,
		element: Node,
		after: Node | null,
	}))[],
	scripts: HTMLScriptElement[],
	math: Element[],
	videos: HTMLVideoElement[],
	// inputs: HTMLInputElement[],
	matrixInputs: Element[],
};

function updateNode(state: Hydration, dom: Element, updated: Element) {
	for (const cls of ['jsenabled']) {
		updated.classList.toggle(cls, dom.classList.contains(cls));
	}
	if (!compareClasses(dom.classList, updated.classList)) {
		state.tasks.push({
			type: 'setAttr',
			element: dom,
			attr: 'class',
			value: updated.classList.toString(),
		});
	}
	const domId = dom.getAttribute("id");
	const updatedId = updated.getAttribute("id");
	if (updatedId && domId !== updatedId)
		state.tasks.push({
			type: 'setAttr',
			element: dom,
			attr: 'id',
			value: updatedId,
		});
	for (const attr of dom.attributes) {
		if (SAFE_ATTRS.test(attr.name)) continue;
		if (!updated.hasAttribute(attr.name)) state.tasks.push({
			type: 'delAttr',
			element: dom,
			attr: attr.name,
		});
	}
	for (const attr of updated.attributes) {
		if (SAFE_ATTRS.test(attr.name)) continue;
		if (dom.getAttribute(attr.name) !== attr.value) state.tasks.push({
			type: 'setAttr',
			element: dom,
			attr: attr.name,
			value: attr.value,
		});
	}
}

async function calculateChanges(state: Hydration, dom: Element, updated: Element) {
	// Update current node
	updateNode(state, dom, updated);
	// Update children
	if (dom.innerHTML === updated.innerHTML) return;
	const [diffLeft, diffRight] = Hirschberg(
		[...dom.childNodes].flatMap(precomputeCompare),
		[...updated.childNodes].flatMap(precomputeCompare),
		compare,
	);
	let lastElement: null | Node = null;
	if (DOMInspector.debugging.has(dom)) {
		console.log(diffLeft, diffRight);
		// biome-ignore lint/suspicious/noDebugger: intentional
		debugger;
	}
	for (let i = 0; i < diffLeft.length; i++) {
		const left = diffLeft[i];
		const right = diffRight[i];
		const replaced = left != null
			&& right != null
			&& !compare(left, right);
		if (left && right && !replaced)
			lastElement = left.type === ChildType.TEXT && left.textType === TextChildType.MATH
				? left.node[left.node.length - 1] : left.node;
		if (replaced && left.type === ChildType.TEXT && left.textType === TextChildType.NORMAL
			&& right.type === ChildType.TEXT && right.textType === TextChildType.NORMAL) {
			state.tasks.push({
				type: 'updateContent',
				element: left.node,
				text: right.data,
			});
			continue;
		}
		if (right == null || replaced) {
			if (left == null) throw new Error;
			// Remove
			if (left.type === ChildType.TEXT && left.textType === TextChildType.MATH) {
				for (const el of left.node) {
					state.tasks.push({
						type: 'remove',
						element: el,
					});
				}
				continue;
			}

			state.tasks.push({
				type: 'remove',
				element: left.node as ChildNode,
			});
		}
		if (left == null || replaced) {
			if (right == null) throw new Error;
			// Insert
			const newNode = dom.ownerDocument.importNode(right.node as Node, true);
			state.tasks.push({
				type: 'insert',
				parent: dom,
				element: newNode,
				after: lastElement,
			});
			lastElement = newNode;
			if (isElement(newNode)) {
				if (newNode.tagName === 'SCRIPT') state.scripts.push(newNode as HTMLScriptElement);
				else state.scripts.push(...newNode.getElementsByTagName('script'));
				if (newNode.classList.contains('filter_mathjaxloader_equation')) state.math.push(newNode);
				else state.math.push(...newNode.getElementsByClassName('filter_mathjaxloader_equation'));
				if (newNode.tagName === 'VIDEO' && newNode.classList.contains('video-js')) state.videos.push(newNode as HTMLVideoElement);
				else state.videos.push(...newNode.querySelectorAll<HTMLVideoElement>('video.video-js'));
				// if (newNode.tagName === 'INPUT') state.inputs.push(newNode as HTMLInputElement);
				// else state.inputs.push(...newNode.getElementsByTagName('input'));
				if (newNode.classList.contains('matrixsquarebrackets')
					|| newNode.classList.contains('matrixroundbrackets')
					|| newNode.classList.contains('matrixbarbrackets')) state.matrixInputs.push(newNode);
				else state.matrixInputs.push(
					...newNode.querySelectorAll<HTMLElement>(
						':scope :is(.matrixsquarebrackets, .matrixroundbrackets, .matrixbarbrackets)',
					));
			}
		}
		if (left != null && right != null && !replaced) {
			// Update
			if (left.type !== ChildType.HTML) continue;
			if (left.tag === 'SCRIPT') continue;
			if (left.classes.contains('questionflag')) continue;
			if (left.classes.contains('video-js')) continue;
			if (left.id.startsWith('stack-iframe-holder-')) continue;
			if (!state.config.needsCourseIndexRefresh && left.id.includes('drawers-courseindex')) continue;
			await calculateChanges(state, left.node, right.node as Element);
			if (left.classes.contains('filter_mathjaxloader_equation')) {
				state.math.push(left.node);
			}
		}
	}
}

const inspectors: Map<Element, DOMInspector> = new Map();

async function hydrate(dom: Element, updated: Element, nameHint: string, config: Hydration['config']) {
	console.log('hydrating', dom, updated);
	const state: Hydration = {
		config,
		// inputs: [],
		math: [],
		matrixInputs: [],
		scripts: [],
		tasks: [],
		videos: [],
	};
	let ancestor = dom.parentElement;
	let newAncestor = updated.parentElement;
	while (ancestor && newAncestor && dom.ownerDocument.contains(ancestor) && updated.ownerDocument.body.contains(newAncestor)) {
		updateNode(state, ancestor, newAncestor);
		ancestor = ancestor.parentElement;
		newAncestor = newAncestor.parentElement;
	}
	await calculateChanges(state, dom, updated);
	const {
		// inputs,
		math,
		matrixInputs,
		scripts,
		tasks,
		videos,
	} = state;
	console.log('hydration tasks:', tasks);
	const toUpdate: Set<Element> = new Set();
	if (DEBUG_HYDRATION) {
		const inspector = inspectors.get(dom) ?? ((el, name) => {
			const inspector = new DOMInspector(el);
			inspectors.set(el, inspector);
			const container = document.getElementById('uclearn-inspectors-list') ?? (() => {
				const list = document.createElement('div');
				list.id = 'uclearn-inspectors-list';
				document.body.append(list);
				return list;
			})();
			const button = document.createElement('button');
			button.textContent = name;
			button.addEventListener('click', () => inspector.open());
			container.append(button);
			return inspector;
		})(dom, nameHint);
		inspector.commit();

		for (const task of tasks) {
			// biome-ignore lint/suspicious/noDebugger: intentional
			if (task.debug) debugger;
			switch (task.type) {
				case "setAttr":
					inspector.prepareModify(task.element);
					task.element.setAttribute(task.attr, task.value);
					toUpdate.add(task.element);
					break;
				case "delAttr":
					inspector.prepareModify(task.element);
					task.element.removeAttribute(task.attr);
					toUpdate.add(task.element);
					break;
				case "updateContent":
					inspector.prepareModify(task.element);
					task.element.data = task.text;
					inspector.mutateNode(task.element);
					break;
				case "remove":
					inspector.prepareModify(task.element);
					inspector.removeNode(task.element);
					// Works with both HTMLElements and Nodes
					task.element.remove();
					break;
				case "insert":
					inspector.prepareModify(task.parent);
					task.parent.insertBefore(
						task.element,
						task.after
							? (task.after.nextSibling ?? null)
							: task.parent.firstChild,
					);
					inspector.insertNode(task.element);
					break;
				default:
					assertNever(task);
			}
		}
		for (const el of toUpdate) {
			inspector.mutateNode(el);
		}
	} else {
		// WARNING: UPDATE ABOVE TO MATCH
		for (const task of tasks) switch (task.type) {
			case 'setAttr':
				task.element.setAttribute(task.attr, task.value);
				break;
			case 'delAttr':
				task.element.removeAttribute(task.attr);
				break;
			case 'updateContent':
				task.element.data = task.text;
				break;
			case 'remove':
				// Works with both HTMLElements and Nodes
				task.element.remove();
				break;
			case 'insert':
				task.parent.insertBefore(task.element, task.after ? task.after.nextSibling ?? null : task.parent.firstChild);
				break;
			default:
				assertNever(task);
		}
	}

	const scriptLoadCompletions = [];
	for (const script of scripts) {
		if (!script.src) continue;
		if (/require(\.min)?\.js$|polyfill\.js$|yui-moodlesimple(?:-min)?\.js$|jquery\.php/i.test(script.src)) continue;
		scriptLoadCompletions.push(new Promise((res, rej) => {
			const el = document.createElement("script");
			if (DEBUG_SCRIPTING) {
				const scriptStartTime = performance.now();
				el.addEventListener('load', e => {
					console.log('Executed script', el, 'in', performance.now() - scriptStartTime, 'ms');
				});
			}
			if (DEBUG) {
				el.addEventListener("error", async (e) => {
					console.warn("Script failed to run:", e, el);
					(await Toast).add("Script failed to run during hydration!", { type: "danger" });
				});
			}
			el.addEventListener("error", res);
			el.addEventListener("load", res);
			el.src = script.src;
			script.insertAdjacentElement("afterend", el);
			script.remove();
		}));
	}
	await Promise.all(scriptLoadCompletions); // Linked script loads
	for (const script of scripts) {
		if (script.src) continue;
		if (/(var|let|const)\s+require/.test(script.text)) continue;
		const el = document.createElement("script");
		if (DEBUG) el.addEventListener("error", async (e) => {
			console.warn("Script failed to run:", e, el);
			(await Toast).add('Script failed to run during hydration!', { type: 'danger' });
		});
		el.text = script.text;
		script.replaceWith(el);
		if (DEBUG_SCRIPTING) {
			const scriptStartTime = performance.now();
			await asyncTimeout(0); // Inline script loads
			console.log('Executed inline script', el, 'in', performance.now() - scriptStartTime, 'ms (with content:', el.text);
		}
	}
	await asyncTimeout(0); // Inline script loads
	if (window.MathJax && !window.MathJax.Hub) {
		// Refresh MathJax
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		(window as any).Y?.use?.("moodle-filter_mathjaxloader-loader", () => {
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			(window as any).M?.filter_mathjaxloader?.configure?.({
				mathjaxconfig: `MathJax.Hub.Config(${JSON.stringify({
					config: ["MMLorHTML.js", "Safe.js"],
					jax: ["input/TeX", "input/MathML", "output/HTML-CSS", "output/NativeMML"],
					extensions: ["tex2jax.js", "mml2jax.js", "MathMenu.js", "MathZoom.js"],
					TeX: {
						extensions: ["AMSmath.js", "AMSsymbols.js", "noErrors.js", "noUndefined.js"]
					},
					tex2jax: {
						inlineMath: [['$$', '$$'], ['\\(', '\\)']],
						displayMath: [['\\[', '\\]']]
					},
					menuSettings: {
						zoom: "Double-Click",
						mpContext: true,
						mpMouse: true
					},
					errorSettings: { message: ["!"] },
					skipStartupTypeset: true,
					messageStyle: "none"
				} satisfies MathJax.Config)});`,
				lang: "en"
			});
		});
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		(window.MathJax as any).skipStartupTypeset = true;
		await new Promise<void>(res => {
			const jaxScript = document.createElement("script");
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			jaxScript.src = (window as any).Y.config.modules.mathjax.fullpath;
			jaxScript.addEventListener("load", () => { window.MathJax.Hub.Configured(); res(); });
			document.head.append(jaxScript);
		});
	}

	mathJaxReady().then(MathJax => {
		for (const m of math) {
			MathJax.Hub.Queue(["Typeset", MathJax.Hub, m]);
		}

		if (!matrixInputCallback) {
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			const callback = (MathJax?.Hub as any)?.Startup?.signal.hooks.End?.hooks[0];
			if (callback)
				matrixInputCallback = new Function(
					"matrixInputs",
					`${callback.hook.toString().match(/^(\s*)(?<handler>matrixInputs\.forEach\(.*?{(?:.|\n)*?^\1}\).*?)$/gm)}`,
				) as (matrixInputs: Element[]) => void;
		}
		if (matrixInputCallback) {
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			(window as any).code = [];
			matrixInputCallback(matrixInputs.splice(0, matrixInputs.length));
		}
	});

	for (const video of videos) {
		vjs(video, JSON.parse(video.getAttribute("data-setup") ?? video.getAttribute("data-setup-lazy") ?? '{}'));
	}

	// for (const input of inputs) {
	// 	if (!input.matches(".que.stack input:is(.algebraic, .numerical), .que.stack .matrixtable input")) continue;
	// 	if (input.closest('[hidden]')) continue;
	// 	initField(input);
	// }
}

const parser = new DOMParser();
let matrixInputCallback: (inputs: Element[]) => void;
async function hydrateFromResponse(resp: Response, hydrationHints: string[] = []) {
	const startTime = performance.now();
	console.time('hydration-parsing');
	const contentType = resp.headers.get("Content-Type")?.split(";")[0] ?? 'text/html';
	if (!contentType.includes("html")) {
		// We shoudln't handle this, load page normally
		location.replace(resp.url);
		return; // needed for typescript
	}
	const updated = parser.parseFromString(
		await resp.text(),
		contentType as DOMParserSupportedType,
	);
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	if (new URL(resp.url).pathname !== location.pathname) (window as any).setupDone = false;
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
	const elPairs: [string, HTMLElement, HTMLElement][] = [];
	for (const selector of hydrationHints) {
		const current = document.querySelectorAll(selector);
		const other = updated.querySelectorAll(selector);
		if (current.length !== 1 || other.length !== 1) {
			if (DEBUG) {
				console.warn("Hydration hint", selector, "failed to locate unique elements, found", current, other);
				(await Toast).add(`Hydration hint '${selector}' failed, selecting (${current.length}, ${other.length}) nodes`, { type: 'warning' });
			}
			elPairs.splice(0, elPairs.length);
			break;
		}
		elPairs.push([selector, current[0] as HTMLElement, other[0] as HTMLElement]);
	}
	// biome-ignore lint/style/noNonNullAssertion: <explanation>
	if (!elPairs.length) elPairs.push([':root', document.getElementById("page-wrapper")!, updated.getElementById("page-wrapper")!]);
	for (const [name, left, right] of elPairs) await hydrate(left, right, name, { needsCourseIndexRefresh });
	console.timeEnd('hydration');
	(await Toast).add(`Hydration in ${((performance.now() - startTime) / 1000).toFixed(2)}s`, { type: 'success' });
}

async function safeFetch(input: RequestInfo | URL, init?: RequestInit) {
	const resp = await fetch(input, init)
		.then((resp) => {
			if (!resp.ok)
				throw new Error(
					`Server responded with ${resp.status}: ${resp.statusText}`,
				);
			return resp;
		})
		.catch(async (err: Error) => {
			const modal = await (await ModalFactory).create({
				type: (await ModalFactory).types.SAVE_CANCEL,
				title: "Error",
				body: err.message,
				buttons: { save: 'Continue', cancel: 'Cancel' },
				removeOnClose: true,
			});
			modal.getRoot().on((await ModalEvents).save, () => location.assign(input instanceof Request ? input.url : input));
			modal.show();
			throw err;
		});
	return resp;
}

export async function initHydration() {
	vjs = await videoJS;
	window.addEventListener(
		"submit",
		async (e) => {
			// if(/^()$/i.test(e.submitter.getAttribute("name")))
			// 	return;
			const form = e.target;
			console.log(e.submitter);
			if (!(form instanceof HTMLFormElement)) return;
			if (form.method === 'dialog') return;
			e.preventDefault();
			const resp = await safeFetch(form.action, {
				method: "POST",
				body: new FormData(form, e.submitter),
			});
			const scrollPos = document.getElementById("page")?.scrollTop;
			if (!e.submitter?.classList.contains('submit'))
				document.getElementById("page")?.scrollTo(0, 0);
			const toHydrate: string[] = [];
			if (e.submitter?.classList.contains('submit')) {
				const question = e.submitter.closest('.que');
				if (question?.id) {
					toHydrate.push('#mod_quiz_navblock');
					toHydrate.push(`#${question.id}`);
				}
			}
			if (e.submitter?.classList.contains('mod_quiz-next-nav') || e.submitter?.classList.contains('mod_quiz-prev-nav')) {
				toHydrate.push('#mod_quiz_navblock');
				toHydrate.push('#region-main');
				toHydrate.push('#page-footer');
			}
			await hydrateFromResponse(resp, toHydrate);
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
		},
		{ capture: true },
	);

	window.addEventListener("click", async (e) => {
		if (e.defaultPrevented) return;
		if (e.ctrlKey) return;
		const link = (e.target as Element).closest("a");
		if (!link) return;
		const target = new URL(link.href);
		if (target.origin !== location.origin) return; // Cross-origin
		if (/\.(?!(?:x|m)?html?|php)\w+$/i.test(target.pathname)) return; // not html
		e.preventDefault();
		const resp = await safeFetch(link.href, {
			method: "GET",
		});
		const scrollPos = document.getElementById("page")?.scrollTop;
		document.getElementById("page")?.scrollTo?.(0, 0);
		const toHydrate: string[] = [];
		if (link.id.startsWith('quiznavbutton')
			|| link.classList.contains('mod_quiz-next-nav')
			|| link.classList.contains('mod_quiz-prev-nav')) {
			toHydrate.push('#mod_quiz_navblock');
			toHydrate.push('#region-main');
			toHydrate.push('#page-footer');
		}
		await hydrateFromResponse(resp, toHydrate);
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
		const resp = await safeFetch(location.href, {
			method: "GET",
		});
		await hydrateFromResponse(resp);
		if (e.state?.scrollPos) {
			document.getElementById("page")?.scrollTo?.(0, e.state.scrollPos);
		}
	});
}
