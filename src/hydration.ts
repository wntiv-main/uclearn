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
import { DEBUG, DEBUG_HYDRATION } from "./global/constants";
import {
	type D2WMessage,
	type HydrationConfig,
	type HydrationElement,
	HydrationElementType,
	type HydrationId,
	type HydrationNode,
	HydrationNodeType,
	HydrationStage,
	type HydrationTasks,
	HydrationTextType,
	type W2DMessage,
} from "./global/hydration";
import { assertNever, asyncTimeout, type ItemOf, type Shifted } from "./global/util";
import { Toast } from "./lib-hook";
import { loadScripts } from "./page-loader";

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
const hydrationStates: Record<HydrationId, {
	elMap: ElementMap;
	config: HydrationConfig;
	root: Element;
	progressPerNode: number;
	nodesVisited: number;
	resolve?(tasks: HydrationTasks): void;
}> = {};

function allocateEl(el: ElementRef, map: ElementMap) {
	const id = map.idCounter++;
	map[id] = el;
	return id;
}

const ID_RGX =
	/^((?:\w+-)+)(?:[0-9a-fA-F]{28}|[0-9a-fA-F]{13})((?:-\w+)*)$|^(single_button)[0-9a-fA-F]{15}$|^yui_.*$|^(url_select_).*$/;

export const SKIP_HYDRATION_CLASS = "__uclearn-hydrate-remove";
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

			if (
				el.matches(
					'.MathJax_Preview:has(+ .MathJax + script[type^="math/"]), .MathJax:has(+ script[type^="math/"])',
				)
			) {
				const next = nodes[i + 1];
				if (isElement(next) && next.matches(".MathJax")) {
					tiedNodes.push(next);
					i++;
				}
				const next2 = nodes[i + 1];
				if (isElement(next2) && next2.matches('script[type^="math/"]')) {
					tiedNodes.push(next2);
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
					content: el.textContent ?? "",
				};
				continue;
			}

			if (el.classList.contains("coderunner-answer")) {
				const next = nodes[i + 1];
				if (isElement(next) && next.classList.contains("ui_wrapper")) {
					tiedNodes.push(next);
					i++;
				}
			}

			yield {
				nodeId: allocateEl(
					{
						node: el,
						tiedNodes,
					},
					map,
				),
				type: HydrationNodeType.ELEMENT,
				tag: el.tagName,
				id: (typeof el.id === "string"
					? el.id
					: (el.getAttribute("id") ?? "")
				).replace(ID_RGX, "$1$2"),
				classes: [...el.classList],
				attributes: new Map(
					[...el.attributes].map(({ name, value }) => [name, value]),
				),
				content: el.innerHTML,
				debugging: DOMInspector.debugging.has(el),
				...(el.classList.contains("video-js")
					? {
						elementType: HydrationElementType.VIDEOJS,
						sources: [],
						// "player" in el
						// 	? (el as VideoJSElement).player.currentSources()
						// 	: vjs.getComponent("Player").getTagSettings(el).sources,
					}
					: {
						elementType:
							el instanceof HTMLScriptElement
								? HydrationElementType.SCRIPT
								: HydrationElementType.NORMAL,
					}),
			};
			continue;
		}
		if (isTextNode(el)) {
			if (el.parentElement?.closest(".filter_mathjaxloader_equation")) {
				const math = /\$(.+?)\$|\\\((.+?)\\\)/g;
				for (const [i, fragment] of Object.entries(el.data.split(math))) {
					if (!fragment) continue;
					yield {
						nodeId: allocateEl(
							{
								node: el.ownerDocument.createTextNode(fragment),
							},
							map,
						),
						type: HydrationNodeType.TEXT,
						content: fragment,
						textType:
							+i % 2 ? HydrationTextType.MATH : HydrationTextType.NORMAL,
					};
				}
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
};

function handleNodeInsert(node: Node, collectors: NodeCollectors) {
	if (!isElement(node)) return;
	if (isElementTag(node, "script")) collectors.scripts.push(node);
	else collectors.scripts.push(...node.getElementsByTagName("script"));
	// if (node.classList.contains("filter_mathjaxloader_equation"))
	// 	MathJax.Hub.Queue(["Typeset", MathJax.Hub, m]);
	// else
	// 	state.math.push(
	// 		...newNode.getElementsByClassName(
	// 			"filter_mathjaxloader_equation",
	// 		),
	// 	);
	// if (isElementTag(node, "video")
	// 	&& node.classList.contains("video-js"))
	// 	vjs(node, JSON.parse(node.getAttribute("data-setup") ?? node.getAttribute("data-setup-lazy") ?? '{}'));
	// else
	// 	state.videos.push(
	// 		...newNode.querySelectorAll<HTMLVideoElement>("video.video-js"),
	// 	);
	// if (newNode.tagName === 'INPUT') state.inputs.push(newNode as HTMLInputElement);
	// else state.inputs.push(...newNode.getElementsByTagName('input'));
	// if (
	// 	newNode.classList.contains("matrixsquarebrackets") ||
	// 	newNode.classList.contains("matrixroundbrackets") ||
	// 	newNode.classList.contains("matrixbarbrackets")
	// )
	// 	state.matrixInputs.push(newNode);
	// else
	// 	state.matrixInputs.push(
	// 		...newNode.querySelectorAll<HTMLElement>(
	// 			":scope :is(.matrixsquarebrackets, .matrixroundbrackets, .matrixbarbrackets)",
	// 		),
	// 	);
}

function debugTask(
	task: ItemOf<HydrationTasks>,
	map: ElementMap,
	inspector: DOMInspector,
	toUpdate: Set<Element>,
	collectors: NodeCollectors,
) {
	// biome-ignore lint/suspicious/noDebugger: intentional
	if (task.debug) debugger;
	switch (task.type) {
		case "setAttr": {
			const el = map[task.element].node as Element;
			inspector.prepareModify(el);
			el.setAttribute(task.attr, task.value);
			toUpdate.add(el);
			break;
		}
		case "delAttr": {
			const el = map[task.element].node as Element;
			inspector.prepareModify(el);
			el.removeAttribute(task.attr);
			toUpdate.add(el);
			break;
		}
		case "updateContent": {
			const node = map[task.element].node as Text;
			inspector.prepareModify(node);
			node.data = task.text;
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
				handleNodeInsert(newNode, collectors);
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

const inspectors: Map<Element, DOMInspector> = new Map();
async function applyHydration(tasks: HydrationTasks, id: HydrationId) {
	const { config, elMap: map, root: dom } = hydrationStates[id];
	const collectors: NodeCollectors = {
		scripts: [],
	};
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
				config.onProgress?.(HydrationStage.APPLYING, i * fract);
			if (i % 50 === 0)
				await yieldToMain();
			debugTask(task, map, inspector, toUpdate, collectors);
		}
		for (const el of toUpdate) {
			inspector.mutateNode(el);
		}
	} else {
		// WARNING: UPDATE ABOVE TO MATCH
		const fract = 1 / tasks.length;
		for (let i = 0; i < tasks.length; i++) {
			const task = tasks[i];
			if (i % 10 === 0)
				config.onProgress?.(HydrationStage.APPLYING, i * fract);
			if (i % 50 === 0)
				await yieldToMain();
			switch (task.type) {
				case "setAttr": {
					const el = map[task.element].node as Element;
					el.setAttribute(task.attr, task.value);
					break;
				}
				case "delAttr": {
					const el = map[task.element].node as Element;
					el.removeAttribute(task.attr);
					break;
				}
				case "updateContent": {
					const node = map[task.element].node as Text;
					node.data = task.text;
					break;
				}
				case "remove": {
					const ref = map[task.element];
					for (const el of [ref.node, ...(ref.tiedNodes ?? [])]) {
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
						handleNodeInsert(newNode, collectors);
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
	config.onProgress?.(HydrationStage.APPLYING, 1);

	await loadScripts(
		collectors.scripts.filter(
			(script) =>
				!/(var|let|const)\s+require/.test(script.text) &&
				!/require(\.min)?\.js$|polyfill\.js$|yui-moodlesimple(?:-min)?\.js$|jquery\.php/i.test(
					script.src,
				),
		),
	);

	// const scriptLoadCompletions = [];
	// for (const script of collectors.scripts) {
	// 	if (!script.src) continue;
	// 	if (/require(\.min)?\.js$|polyfill\.js$|yui-moodlesimple(?:-min)?\.js$|jquery\.php/i.test(script.src)) continue;
	// 	scriptLoadCompletions.push(new Promise((res, rej) => {
	// 		const el = document.createElement("script");
	// 		if (DEBUG_SCRIPTING) {
	// 			const scriptStartTime = performance.now();
	// 			el.addEventListener('load', e => {
	// 				console.log('Executed script', el, 'in', performance.now() - scriptStartTime, 'ms');
	// 			});
	// 		}
	// 		if (DEBUG) {
	// 			el.addEventListener("error", async (e) => {
	// 				console.warn("Script failed to run:", e, el);
	// 				(await Toast).add("Script failed to run during hydration!", { type: "danger" });
	// 			});
	// 		}
	// 		el.addEventListener("error", res);
	// 		el.addEventListener("load", res);
	// 		el.src = script.src;
	// 		script.insertAdjacentElement("afterend", el);
	// 		script.remove();
	// 	}));
	// }
	// 	await Promise.all(scriptLoadCompletions); // Linked script loads
	// 	for (const script of scripts) {
	// 		if (script.src) continue;
	// 		if (/(var|let|const)\s+require/.test(script.text)) continue;
	// 		const el = document.createElement("script");
	// 		if (DEBUG) el.addEventListener("error", async (e) => {
	// 			console.warn("Script failed to run:", e, el);
	// 			(await Toast).add('Script failed to run during hydration!', { type: 'danger' });
	// 		});
	// 		el.text = script.text;
	// 		script.replaceWith(el);
	// 		if (DEBUG_SCRIPTING) {
	// 			const scriptStartTime = performance.now();
	// 			await asyncTimeout(0); // Inline script loads
	// 			console.log('Executed inline script', el, 'in', performance.now() - scriptStartTime, 'ms (with content:', el.text);
	// 		}
	// 	}
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
			hydrationStates[msg.hydrationId].resolve?.(msg.tasks);
			break;
		}
		case "requestChildren": {
			const id = msg.hydrationId;
			const parent = hydrationStates[id].elMap[msg.nodeId];
			worker.postMessage({
				type: "hydrateChildren",
				hydrationId: id,
				nodeId: msg.nodeId,
				children: [...precomputeCompare(parent.node.childNodes, hydrationStates[id].elMap)],
			});
			break;
		}
		case "visited": {
			const state = hydrationStates[msg.hydrationId];
			state.nodesVisited++;
			state.config.onProgress?.(HydrationStage.HYDRATING, state.nodesVisited * state.progressPerNode);
			break;
		}
		case "visitedAll": {
			const state = hydrationStates[msg.hydrationId];
			const ref = state.elMap[msg.nodeId];
			for (const node of [ref.node, ...ref.tiedNodes ?? []]) if (isElement(node))
				state.nodesVisited += node.querySelectorAll('*').length + 1;
			state.config.onProgress?.(HydrationStage.HYDRATING, state.nodesVisited * state.progressPerNode);
			break;
		}
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
		const script = await (await fetch(`${EXT_URL}/hydration-worker.js`)).blob();
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
	disposeWorkerTimeout = setTimeout(() => {
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
	const completion = new Promise<HydrationTasks>(res => { hydrationStates[id].resolve = res; });
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

	(await worker).postMessage({
		type: "hydrate",
		hydrationId: id,
		config: { needsCourseIndexRefresh: config.needsCourseIndexRefresh },
		parent: [el as HydrationElement, up as HydrationElement],
		children: [leftChildren, rightChildren],
	});

	await applyHydration(await completion, id);
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
