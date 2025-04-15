import type JXG from "jsxgraph";
import type { Board, } from "jsxgraph";
import { asyncTimeout, chainIter } from "../../global/util";
import { isElement } from "../domutil";
import { type ColoredNode, getColoredNodes, handleColoredNode, THEMEABLE_SELECTOR } from "../theme";
import { onPostHydrate } from "../navigation";

type BoardCtor = typeof Board & {
	new(
		container: string | Element,
		renderer: unknown,
		id: string,
		origin: JXG.Coords,
		zoomX: number,
		zoomY: number,
		unitX: number,
		unitY: number,
		canvasWidth: number,
		canvasHeight: number,
		attributes: object): Board;
	_uclearnIsProxied?: boolean;
};

let _jsxGraphObserver: MutationObserver | null = null;

function patchBoard(board: BoardCtor) {
	return new Proxy(board, {
		construct(
			target,
			[id, ...args]: ConstructorParameters<BoardCtor>,
			newTarget,
		) {
			const el = typeof id === "string" ? document.getElementById(id) : id;
			if (!el) throw new Error(`No element found for JSXGraph '${id}'`);

			_jsxGraphObserver ??= new MutationObserver((evts) => {
				for (const e of evts) {
					if (e.type === "childList")
						for (const el of chainIter(e.addedNodes)) {
							if (!isElement(el)) continue;
							if (el.matches(THEMEABLE_SELECTOR))
								handleColoredNode(el as ColoredNode);
							for (const node of el.querySelectorAll<ColoredNode>(
								THEMEABLE_SELECTOR,
							))
								handleColoredNode(node);
						}
					else if (isElement(e.target)) {
						if (e.target.matches(THEMEABLE_SELECTOR)) {
							const details = getColoredNodes().get(
								e.target as ColoredNode,
							);
							if (details?.ignore) details.ignore--;
							else handleColoredNode(e.target as ColoredNode);
						} else getColoredNodes().delete(e.target as ColoredNode);
					}
				}
			});

			const board = Reflect.construct(target, [el, ...args], newTarget);

			(async () => {
				await asyncTimeout(0);
				const root = el.attachShadow({ mode: "closed" });
				_jsxGraphObserver.observe(root, {
					childList: true,
					subtree: true,
					attributeFilter: ["stroke", "fill", "style", "bgcolor"],
				});
				const slot = document.createElement('slot');
				root.append(...([] as Node[]).filter.call(el.childNodes, el => {
					if (!isElement(el)) return true;
					if (!/^\s*\\\(.*\\\)\s*$/.test(el.textContent ?? '')) return true;
					const observer = new MutationObserver(evts => {
						for (const evt of evts) {
							if (!/^\s*\\\(.*\\\)\s*$/.test(evt.target.textContent ?? '')) {
								observer.disconnect();
								root.append(evt.target);
							}
						}
					});
					observer.observe(el, { childList: true });
				}), slot);
			})();

			return board;
		},
	});
}

declare global {
	interface Window {
		emth119DemoBoards?: Record<string, Board & {
			playingTimer?: ReturnType<typeof setInterval>;
		}>;
	}
}

export function patchJSXGraph() {
	// EMTH119 probability content JSXGraphs error after hydration
	onPostHydrate(() => {
		if (window.emth119DemoBoards) for (const [id, board] of Object.entries(window.emth119DemoBoards)) {
			if (document.getElementById(id)) continue;
			if (board.playingTimer) clearInterval(board.playingTimer);
		}
	});

	let _jxg: typeof JXG | undefined = undefined;
	Object.defineProperty(window, "JXG", {
		get: () => _jxg,
		set(v: typeof JXG & { Board: BoardCtor; }) {
			_jxg = v;
			if (v.Board && !('_uclearnIsProxied' in v.Board)) {
				v.Board._uclearnIsProxied = true;
				v.Board = patchBoard(v.Board);
			} else if (v && !('Board' in v)) {
				let _Board: BoardCtor | undefined = undefined;
				Object.defineProperty(v, 'Board', {
					get: () => _Board,
					set(u: BoardCtor) {
						u._uclearnIsProxied = true;
						_Board = patchBoard(u);
					},
				});
			}
		},
	});
}
