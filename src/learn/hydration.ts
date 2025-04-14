import { EXT_URL } from "./constants";
import { DOMInspector } from "./dominspect";
import {
	compareClasses,
	isElement,
	isElementTag,
	isTextNode,
	nodeDepth,
	yieldToMain,
} from "./domutil";
import { DEBUG, DEBUG_HYDRATION } from "../global/constants";
import {
	type D2WMessage,
	type HydrationConfig,
	type HydrationElement,
	HydrationElementType,
	type HydrationId,
	type HydrationNode,
	HydrationNodeType,
	type HydrationTasks,
	HydrationTextType,
	PartialHydrationStage,
	type W2DMessage,
} from "../global/hydration";
import { assertNever, chainIter, type ItemOf, type Shifted } from "../global/util";
import { Toast } from "./patches/lib-hook";
import { loadScripts, SKIP_SCRIPT_CLASS } from "./script-loader";
import { initField, initMatrixField, MATH_FIELD_SELECTOR, MATHLIVE_FIELD_CLASS } from "./mathlive-loader";
import { VJS_WRAPPER_CLASS } from "./patches/videojs-patches";

type TypedMessageWorker<T> = Omit<Worker, "postMessage"> & {
	postMessage(
		message: T,
		...args: Shifted<Parameters<Worker["postMessage"]>>
	): ReturnType<Worker["postMessage"]>;
};

type ElementRef = {
	node: Node;
	tiedNodes?: Node[];
	_domPos?: Node;
};
type ElementMap = Record<number, ElementRef> & { idCounter: number; };

let worker: Promise<TypedMessageWorker<D2WMessage>> | null = null;
let disposeWorker: (() => void) | null = null;
let disposeWorkerTimeout: ReturnType<typeof setTimeout> | null = null;
let onWorkerReady: () => void;
let hydrationIdCounter = 0;
const hydrationStates: Partial<Record<HydrationId, {
	elMap: ElementMap;
	config: HydrationConfig;
	root: Element;
	progressPerNode: number;
	nodesVisited: number;
	resolve?(tasks: HydrationTasks): void;
}>> = {};

declare global {
	interface Window {
		__uclearnHydrationStates?: typeof hydrationStates;
	}
}
if (DEBUG_HYDRATION) window.__uclearnHydrationStates = hydrationStates;

function allocateEl(el: ElementRef, map: ElementMap) {
	const id = map.idCounter++;
	map[id] = el;
	return id;
}

const ID_RGX =
	/^((?:\w+-)+)(?:[0-9a-fA-F]{28}|[0-9a-fA-F]{13})((?:-\w+)*)$|^(single_button)[0-9a-fA-F]{15}$|^yui_.*$|^(url_select_).*$/;

export const HIDDEN_CLS = '__uclearn';
export const SKIP_HYDRATION_CLASS = `${HIDDEN_CLS}-hydrate-remove`;
export const SKIP_UPDATE_CLASS = `${HIDDEN_CLS}-hydrate-static`;

const MJ_SELECTOR = ":is(.MathJax, .MathJax_Display)";
const MJ_SCRIPT_SELECTOR = 'script[type^="math/"]';

const MATH_RX = /(\$.+?\$|\\\(.+?\\\)|\\\[.+?\\\])/gs;
const MATH_INNER_RX = /^(\$|\\\(|\\\[)(.+)(\$|\\\)|\\\])$/s;

function* precomputeCompare(
	nodes: ArrayLike<Node>,
	map: ElementMap,
): Generator<HydrationNode> {
	for (let i = 0; i < nodes.length; i++) {
		const el = nodes[i];
		if (
			el.nodeType === Node.COMMENT_NODE ||
			(el as Element).classList?.contains(SKIP_HYDRATION_CLASS)
		)
			continue;
		if (isElement(el)) {
			const tiedNodes: Node[] = [];
			let root: Element = el;

			if (
				el.matches(
					`.MathJax_Preview:has(+ ${MJ_SELECTOR} + ${MJ_SCRIPT_SELECTOR
					}), ${MJ_SELECTOR}:has(+ ${MJ_SCRIPT_SELECTOR})`,
				)
			) {
				let content = '';
				const next = nodes[i + 1];
				if (isElement(next) && next.matches(MJ_SELECTOR)) {
					tiedNodes.push(next);
					i++;
				}
				const latexScript = nodes[i + 1];
				if (isElement(latexScript) && latexScript.matches(MJ_SCRIPT_SELECTOR)) {
					tiedNodes.push(latexScript);
					content = latexScript.textContent ?? '';
					i++;
				}
				yield {
					nodeId: allocateEl(
						{
							node: el,
							tiedNodes,
						},
						map,
					),
					type: HydrationNodeType.TEXT,
					textType: HydrationTextType.MATH,
					content,
				};
				continue;
			}

			if (el.classList.contains(MATHLIVE_FIELD_CLASS)) {
				const next = nodes[++i];
				tiedNodes.push(el);
				root = next as Element;
			} else if (el.classList.contains("coderunner-answer")) {
				const next = nodes[i + 1];
				if (isElement(next) && next.getAttribute('id')?.includes("answer_wrapper")) {
					tiedNodes.push(next);
					i++;
				}
			}

			const id = (typeof root.id === "string"
				? root.id
				: root.getAttribute("id") ?? "");

			yield {
				nodeId: allocateEl(
					{
						node: root,
						tiedNodes,
					},
					map,
				),
				type: HydrationNodeType.ELEMENT,
				tag: root.tagName,
				id: id.replace(ID_RGX, "$1$2"),
				rawId: id,
				skipUpdate: root.classList.contains(SKIP_UPDATE_CLASS),
				classes: [...root.classList].filter(cls => !cls.startsWith(HIDDEN_CLS)),
				attributes: new Map(
					[...root.attributes].map(({ name, value }) => [name, value]),
				),
				content: root.innerHTML,
				debugging: DOMInspector.debugging.has(el),
				...(root.classList.contains("video-js") || root.classList.contains(VJS_WRAPPER_CLASS)
					? {
						elementType: HydrationElementType.VIDEOJS,
					}
					: {
						elementType:
							root instanceof HTMLScriptElement
								? HydrationElementType.SCRIPT
								: HydrationElementType.NORMAL,
					}),
			};
			continue;
		}
		if (isTextNode(el)) {
			if (el.ownerDocument !== document && el.parentElement?.closest(".filter_mathjaxloader_equation")) {
				for (const fragment of el.data.split(MATH_RX)) {
					if (!fragment) continue;
					const nodeId = allocateEl({ node: el.ownerDocument.createTextNode(fragment) }, map);
					const match = fragment.match(MATH_INNER_RX);
					if (match) {
						const [/* overall */, /* prefix */, content, /* suffix */] = match;
						yield {
							nodeId,
							type: HydrationNodeType.TEXT,
							content,
							textType: HydrationTextType.MATH,
						};
					} else {
						yield {
							nodeId,
							type: HydrationNodeType.TEXT,
							content: fragment,
							textType: HydrationTextType.NORMAL,
						};
					}
				}
				continue;
			}
			yield {
				nodeId: allocateEl({ node: el }, map),
				type: HydrationNodeType.TEXT,
				content: el.data,
				textType: HydrationTextType.NORMAL,
			};
			continue;
		}
		yield {
			nodeId: allocateEl({ node: el }, map),
			type: HydrationNodeType.OTHER,
		};
	}
}

type NodeCollectors = {
	scripts: HTMLScriptElement[];
	math: Set<Element>;
	matrixFields: HTMLElement[];
};

type QuerySelect<T extends string> = T extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[T]
	: T extends keyof SVGElementTagNameMap ? SVGElementTagNameMap[T]
	: T extends keyof MathMLElementTagNameMap ? MathMLElementTagNameMap[T]
	/** @deprecated */
	: T extends keyof HTMLElementDeprecatedTagNameMap ? HTMLElementDeprecatedTagNameMap[T]
	: T extends `.${string}` ? HTMLElement : Element;

const insertHandlers: [string | null, string, (node: Node) => void][] = [
	[...MATH_FIELD_SELECTOR, field => initField(field as HTMLInputElement)]
];
const updateHandlers: Record<string, [string, (node: Node, value?: string) => void][]> = {};

export function onNodeInsert<S extends string>(parent: string | null, selector: S, cb: (node: QuerySelect<S>) => void): void;
export function onNodeInsert<T extends Node>(parent: string | null, selector: string, cb: (node: T) => void): void;
export function onNodeInsert(parent: string | null, selector: string, cb: (node: Node) => void) {
	insertHandlers.push([parent, selector, cb]);
}

export function onNodeUpdate(cb: (node: Node, value?: string) => void, selector: string, attrs?: string | string[]) {
	for (const attr of Array.isArray(attrs) ? attrs : [attrs ?? '*'])
		// biome-ignore lint/suspicious/noAssignInExpressions: intentional gdammit
		(updateHandlers[attr] ??= []).push([selector, cb]);
}

function handleNodeInsert(parent: Node, node: Node, collectors: NodeCollectors) {
	if (!isElement(node)) {
		const math = node.parentElement?.closest(".filter_mathjaxloader_equation");
		if (math) collectors.math.add(math);
		return;
	}
	if (isElementTag(node, "script") && !node.classList.contains(SKIP_SCRIPT_CLASS)) collectors.scripts.push(node);
	else collectors.scripts.push(...node.querySelectorAll<HTMLScriptElement>(`script:not(.${SKIP_SCRIPT_CLASS})`));
	if (node.classList.contains("filter_mathjaxloader_equation"))
		collectors.math.add(node);
	else for (const el of node.getElementsByClassName("filter_mathjaxloader_equation"))
		collectors.math.add(el);
	// if (isElementTag(node, "video")
	// 	&& node.classList.contains("video-js"))
	// 	vjs(node, JSON.parse(node.getAttribute("data-setup") ?? node.getAttribute("data-setup-lazy") ?? '{}'));
	// else
	// 	state.videos.push(
	// 		...newNode.querySelectorAll<HTMLVideoElement>("video.video-js"),
	// 	);
	if (
		node.classList.contains("matrixsquarebrackets") ||
		node.classList.contains("matrixroundbrackets") ||
		node.classList.contains("matrixbarbrackets")
	)
		collectors.matrixFields.push(node as HTMLElement);
	else
		collectors.matrixFields.push(
			...node.querySelectorAll<HTMLElement>(
				":is(.matrixsquarebrackets, .matrixroundbrackets, .matrixbarbrackets)",
			),
		);
	for (const [parentSel, selector, handler] of insertHandlers) {
		if (!parentSel || isElement(parent) && parent.closest(parentSel)) {
			if (node.matches(selector)) handler(node);
			node.querySelectorAll(selector).forEach(handler);
		} else if (node.matches(parentSel)) {
			node.querySelectorAll(selector).forEach(handler);
		} else node.querySelectorAll(`:is(${parentSel}) :is(${selector})`).forEach(handler);
	}
}

function handleNodeUpdate(attr: string, node: Node, value?: string) {
	for (const [selector, handler] of chainIter(updateHandlers['*'] ?? [], updateHandlers[attr] ?? [])) {
		if (!selector || (isElement(node) && node.matches(selector))) handler(node, value);
	}
}

function debugTask(
	task: ItemOf<HydrationTasks>,
	map: ElementMap,
	inspector: DOMInspector,
	toUpdate: Set<Element>,
	collectors: NodeCollectors,
) {
	/* eslint-disable-next-line no-debugger
	*/// biome-ignore lint/suspicious/noDebugger: intentional debugging tool
	if (task.debug) debugger;
	switch (task.type) {
		case "setAttr": {
			const el = map[task.element].node as Element;
			inspector.prepareModify(el);
			el.setAttribute(task.attr, task.value);
			handleNodeUpdate(task.attr, el, task.value);
			toUpdate.add(el);
			break;
		}
		case "delAttr": {
			const el = map[task.element].node as Element;
			inspector.prepareModify(el);
			el.removeAttribute(task.attr);
			handleNodeUpdate(task.attr, el);
			toUpdate.add(el);
			break;
		}
		case "updateContent": {
			const node = map[task.element].node as Text;
			inspector.prepareModify(node);
			node.data = task.text;
			handleNodeUpdate('content', node, task.text);
			inspector.mutateNode(node);
			break;
		}
		case "remove": {
			const ref = map[task.element];
			for (const el of [ref.node, ...(ref.tiedNodes ?? [])]) {
				inspector.prepareModify(el);
				inspector.removeNode(el);
				(el as ChildNode).remove();
			}
			break;
		}
		case "insert": {
			const ref = map[task.element];
			const parent = map[task.parent].node;
			inspector.prepareModify(parent);
			const dom = parent.ownerDocument ?? document;
			const nodes = [ref.node, ...(ref.tiedNodes ?? [])].map((node) => {
				const newNode = dom.adoptNode(node);
				handleNodeInsert(parent, newNode, collectors);
				return newNode;
			});
			const fragment = dom.createDocumentFragment();
			fragment.append(...nodes);
			parent.insertBefore(
				fragment,
				task.after
					? (((ref) => {
						// Last node in fragment
						return ref._domPos ?? ref.tiedNodes?.at(-1) ?? ref.node;
					})(map[task.after]).nextSibling ?? null)
					: parent.firstChild,
			);
			for (const node of nodes) inspector.insertNode(node);
			ref._domPos = nodes.at(-1);
			break;
		}
		default:
			assertNever(task);
	}
}

const idAliases: Record<string, string[]> = {};
const aliasId: Record<string, string> = {};

function destroyId(id: string) {
	if (!(id in idAliases)) return;
	for (const alias of idAliases[id]) {
		delete aliasId[alias];
	}
	delete idAliases[id];
}

function assignAlias(id: string, alias: string) {
	aliasId[alias] = id;
	// biome-ignore lint/suspicious/noAssignInExpressions: why not
	(idAliases[id] ??= []).push(alias);
}

// TODO: put alias data to use

// Document.prototype._querySelector = Element.prototype._querySelector = function (selector: string) {
// 	return this.querySelector(selector
// 		.replaceAll(/(?<=#)(?<id>[-\w]*)/g, (_, id) => aliasId[id] ?? id));
// };
// Document.prototype._querySelectorAll = Element.prototype._querySelectorAll = function (selector: string) {
// 	return this.querySelectorAll(selector
// 		.replaceAll(/(?<=#)(?<id>[-\w]*)/g, (_, id) => aliasId[id] ?? id));
// };
// Document.prototype._getElementById = function (selector: string) {
// 	return this.getElementById(aliasId[selector] ?? selector);
// };

export async function initDocumentParts() {
	const collectors: NodeCollectors = {
		scripts: [],
		math: new Set(),
		matrixFields: [],
	};
	handleNodeInsert(document, document.documentElement, collectors);
	await handlePostHydrateCollectors(collectors, true);
}

let lock: Promise<void> | null = null;
const inspectors: Map<Element, DOMInspector> = new Map();
async function applyHydration(tasks: HydrationTasks, { config, elMap: map, root: dom }: NonNullable<typeof hydrationStates[HydrationId]>) {
	const collectors: NodeCollectors = {
		scripts: [],
		math: new Set(),
		matrixFields: [],
	};
	await lock;
	// biome-ignore lint/style/noNonNullAssertion: immediately initialized
	let unlock: (() => void) = null!;
	lock = new Promise<void>(res => { unlock = res; });
	let _inspector: DOMInspector | undefined = undefined;
	if (DEBUG_HYDRATION && !config.evadeDebugging) {
		const toUpdate: Set<Element> = new Set();
		const inspector =
			inspectors.get(dom) ??
			((el, name) => {
				const inspector = new DOMInspector(el);
				inspectors.set(el, inspector);
				const container =
					document.getElementById("uclearn-inspectors-list") ??
					(() => {
						const list = document.createElement("div");
						list.id = "uclearn-inspectors-list";
						list.classList.add(SKIP_HYDRATION_CLASS);
						document.body.append(list);
						return list;
					})();
				const button = document.createElement("button");
				button.textContent = name;
				button.addEventListener("click", () => inspector.open());
				container.append(button);
				return inspector;
			})(dom, config.nameHint);
		inspector.commit();

		const fract = 1 / tasks.length;
		for (let i = 0; i < tasks.length; i++) {
			const task = tasks[i];
			if (i % 10 === 0)
				config.onProgress?.(PartialHydrationStage.APPLYING, i * fract);
			if (i % 50 === 0)
				await yieldToMain();
			debugTask(task, map, inspector, toUpdate, collectors);
		}
		for (const el of toUpdate) {
			inspector.mutateNode(el);
		}
		_inspector = inspector;
	} else {
		// WARNING: UPDATE ABOVE TO MATCH
		const fract = 1 / tasks.length;
		for (let i = 0; i < tasks.length; i++) {
			const task = tasks[i];
			if (i % 10 === 0)
				config.onProgress?.(PartialHydrationStage.APPLYING, i * fract);
			if (i % 50 === 0)
				await yieldToMain();
			switch (task.type) {
				case "setAttr": {
					const el = map[task.element].node as Element;
					el.setAttribute(task.attr, task.value);
					handleNodeUpdate(task.attr, el, task.value);
					break;
				}
				case "delAttr": {
					const el = map[task.element].node as Element;
					el.removeAttribute(task.attr);
					handleNodeUpdate(task.attr, el);
					break;
				}
				case "updateContent": {
					const node = map[task.element].node as Text;
					node.data = task.text;
					handleNodeUpdate('content', node, task.text);
					break;
				}
				case "remove": {
					const ref = map[task.element];
					for (const el of [ref.node, ...(ref.tiedNodes ?? [])]) {
						if (isElement(el)) {
							const id = el.getAttribute('id');
							if (id) destroyId(id);
							for (const idEl of el.querySelectorAll('[id]')) {
								const id = idEl.getAttribute('id');
								if (id) destroyId(id);
							}
						}
						(el as ChildNode).remove();
					}
					break;
				}
				case "insert": {
					const ref = map[task.element];
					const parent = map[task.parent].node;
					const dom = parent.ownerDocument ?? document;
					const nodes = [ref.node, ...(ref.tiedNodes ?? [])].map((node) => {
						const newNode = dom.adoptNode(node);
						handleNodeInsert(parent, newNode, collectors);
						return newNode;
					});
					const fragment = dom.createDocumentFragment();
					fragment.append(...nodes);
					parent.insertBefore(
						fragment,
						task.after
							? (((ref) => {
								// Last node in fragment
								return ref._domPos ?? ref.tiedNodes?.at(-1) ?? ref.node;
							})(map[task.after]).nextSibling ?? null)
							: parent.firstChild,
					);
					ref._domPos = nodes.at(-1);
					break;
				}
				default:
					assertNever(task);
			}
		}
	}
	config.onProgress?.(PartialHydrationStage.APPLYING, 1);

	await handlePostHydrateCollectors(collectors, false, _inspector);
	lock = null;
	unlock();
}

async function handlePostHydrateCollectors(collectors: NodeCollectors, first?: boolean, inspector?: DOMInspector) {
	await loadScripts(
		first ? collectors.scripts : collectors.scripts.filter(
			(script) =>
				!/(var|let|const)\s+require/.test(script.text) &&
				!/require(\.min)?\.js$|polyfill\.js$|yui-moodlesimple(?:-min)?\.js$|jquery\.php/i.test(
					script.src,
				),
		),
		undefined,
		inspector ? (old, replace) => inspector.hotswapNode(old, replace) : undefined,
	);
	if (!first) window.MathJax?.Hub?.Queue(["Typeset", window.MathJax.Hub, [...collectors.math]]);
	for (const field of collectors.matrixFields) initMatrixField(field);
}

async function handleWorkerMessage(
	worker: TypedMessageWorker<D2WMessage>,
	msg: W2DMessage,
) {
	switch (msg.type) {
		case "ready":
			onWorkerReady?.();
			break;
		case "tasks": {
			hydrationStates[msg.hydrationId]?.resolve?.(msg.tasks);
			break;
		}
		case "requestChildren": {
			const id = msg.hydrationId;
			const state = hydrationStates[id];
			if (!state) break;
			const parent = state.elMap[msg.nodeId];
			worker.postMessage({
				type: "hydrateChildren",
				hydrationId: id,
				nodeId: msg.nodeId,
				children: [...precomputeCompare(parent.node.childNodes, state.elMap)],
			});
			break;
		}
		case "visited": {
			const state = hydrationStates[msg.hydrationId];
			if (!state) break;
			state.nodesVisited++;
			state.config.onProgress?.(PartialHydrationStage.HYDRATING, state.nodesVisited * state.progressPerNode);
			break;
		}
		case "visitedAll": {
			const state = hydrationStates[msg.hydrationId];
			if (!state) break;
			const ref = state.elMap[msg.nodeId];
			for (const node of [ref.node, ...ref.tiedNodes ?? []]) if (isElement(node))
				state.nodesVisited += node.querySelectorAll('*').length + 1;
			state.config.onProgress?.(PartialHydrationStage.HYDRATING, state.nodesVisited * state.progressPerNode);
			break;
		}
		case "alias":
			assignAlias(msg.id, msg.alias);
			console.log('aliased', msg.alias, 'to', msg.id);
			break;
		default:
			assertNever(msg);
	}
}

export async function hydrate(
	element: Element,
	updated: Element,
	config: HydrationConfig,
) {
	worker ??= (async () => {
		const script = await (await fetch(`${EXT_URL}/learn/hydration-worker.js`)).blob();
		const url = URL.createObjectURL(script);
		const worker = new Worker(url, {
			name: "HydrationWorker",
			type: "module",
		});
		await new Promise<void>((res) => {
			disposeWorker = () => {
				worker.terminate();
				URL.revokeObjectURL(url);
			};
			onWorkerReady = res;
			worker.addEventListener("message", (e) =>
				handleWorkerMessage(worker, e.data as W2DMessage),
			);
			if (DEBUG) worker.addEventListener("error", async (e) => {
				console.error("Error in hydration worker:", e);
				(await Toast).add(e.message, {
					title: "ERROR in Hydration Worker:",
					type: "danger",
				});
			});
		});
		return worker;
	})();
	if (disposeWorkerTimeout) clearTimeout(disposeWorkerTimeout);
	if (!DEBUG_HYDRATION) disposeWorkerTimeout = setTimeout(() => {
		disposeWorker?.();
		worker = null;
		disposeWorkerTimeout = null;
		disposeWorker = null;
	}, 60e3);
	const id = hydrationIdCounter++;
	const elMap = { idCounter: 0 };

	const treeSize = element.querySelectorAll("*").length + 1;

	hydrationStates[id] = {
		elMap,
		config,
		root: element,
		nodesVisited: 0,
		progressPerNode: 1 / treeSize,
	};
	config.signal?.addEventListener("abort", () => hydrationStates[id] && delete hydrationStates[id]);
	const completion = new Promise<HydrationTasks>(res => { if (hydrationStates[id]) hydrationStates[id].resolve = res; });
	const [el, up] = precomputeCompare([element, updated], elMap);
	const leftChildren = [...precomputeCompare(element.childNodes, elMap)];
	const rightChildren = [...precomputeCompare(updated.childNodes, elMap)];

	if (config.updateUpTree) {
		if (DEBUG && nodeDepth(element) !== nodeDepth(updated)) {
			console.error(
				"Hydrating up tree from nodes",
				element,
				updated,
				"failed due to differing tree depths",
			);
			(await Toast).add("Upward hydration failed -- different tree depths", { type: 'danger' });
		} else {
			let ancestor = element.parentElement;
			let newAncestor = updated.parentElement;
			while (
				ancestor &&
				newAncestor &&
				element.ownerDocument.contains(ancestor) &&
				updated.ownerDocument.body.contains(newAncestor)
			) {
				updateNode(ancestor, newAncestor);
				ancestor = ancestor.parentElement;
				newAncestor = newAncestor.parentElement;
			}
		}
	}

	const w = await worker;
	if (config.signal?.aborted) return;
	w.postMessage({
		type: "hydrate",
		hydrationId: id,
		config: { needsCourseIndexRefresh: config.needsCourseIndexRefresh },
		parent: [el as HydrationElement, up as HydrationElement],
		children: [leftChildren, rightChildren],
	});

	config.signal?.addEventListener("abort", () => { w.postMessage({ type: 'abort', hydrationId: id }); });

	const result = await completion;
	if (config.signal?.aborted) return;
	await applyHydration(result, hydrationStates[id]);
	delete hydrationStates[id];
}

const SAFE_ATTRS = /^id$|^class$|^data-uclearn/;
function updateNode(dom: Element, updated: Element) {
	for (const cls of ["jsenabled"]) {
		updated.classList.toggle(cls, dom.classList.contains(cls));
	}
	if (!compareClasses(dom.classList, updated.classList)) {
		dom.className = updated.classList.toString();
	}
	const domId = dom.getAttribute("id");
	const updatedId = updated.getAttribute("id");
	if (updatedId && domId !== updatedId) dom.setAttribute("id", updatedId);
	for (const { name } of dom.attributes) {
		if (SAFE_ATTRS.test(name)) continue;
		if (!updated.hasAttribute(name)) dom.removeAttribute(name);
	}
	for (const { name, value } of updated.attributes) {
		if (SAFE_ATTRS.test(name)) continue;
		if (dom.getAttribute(name) !== value) dom.setAttribute(name, value);
	}
}
