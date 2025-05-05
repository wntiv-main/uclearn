import { MathfieldElement } from "mathlive";
import { onNodeInsert, SKIP_HYDRATION_CLASS } from "./hydration";
import { COPY_ICON, DIVIDE_ICON, EDIT_ICON, MINUS_ICON, PLUS_ICON, TIMES_ICON } from "./icons";
import { getMoodleDialog } from "./patches/yui-modal";
import { getYUIInstance } from "./patches/lib-hook";
import { initMathField } from "./mathlive-loader";
import { isElement, isElementTag } from "./domutil";
import { copyTextToClipboard } from "./clipboard";
import { h, render } from "preact";
import htm from 'htm';
import { EXT_URL } from "./constants";
import { getTheme } from "./theme";
import { DEBUG } from "../global/constants";

declare global {
	interface Window {
		EXCALIDRAW_ASSET_PATH: string;
	}
}

window.EXCALIDRAW_ASSET_PATH = `${EXT_URL}/excalidraw/`;

import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawProps } from "@excalidraw/excalidraw/dist/types/excalidraw/types";

export const WORKSPACE_ITEMS = [
	{
		name: 'Math Field',
		icon: `<div class="__uclearn-icon-grid">${PLUS_ICON}${TIMES_ICON}${MINUS_ICON}${DIVIDE_ICON}</div>`,
		classes: ['__uclearn-workspace-math'],
		action: createMathModal,
	},
	{
		name: "Drawing Overlay",
		icon: `${EDIT_ICON}`,
		classes: ["__uclearn-workspace-draw"],
		action: createExcalidrawWorkspace,
	}
] as const;

async function createMathModal(value = '') {
	const Dialog = await getMoodleDialog();
	const container = document.createElement('form');
	const field = new MathfieldElement({});
	initMathField(field);
	field.setValue(value.includes('\\begin') ? value : `\\displaylines{ ${value}`);
	container.append(field);
	const dialog = new Dialog({
		bodyContent: (await getYUIInstance()).one(container),
		center: true,
		draggable: true,
		width: 'fit-content',
	});
	dialog.applyAndTrapFocus = () => { };
	dialog.trapFocus = () => { };
	dialog.show();
	dialog.after('visibleChange', e => e.newVal || dialog.destroy(), dialog);
}

let excalidrawStyles: HTMLLinkElement | null = null;
function createExcalidrawWorkspace() {
	const wrapper = document.createElement('div');
	wrapper.classList.add(SKIP_HYDRATION_CLASS, '__uclearn-excalidraw-overlay');
	const shadowRoot = wrapper.attachShadow({ mode: 'closed' });
	const innerWrapper = document.createElement('div');
	innerWrapper.style.height = '100%';
	const styles = document.createElement('link');
	styles.rel = 'stylesheet';
	styles.href = `${EXT_URL}/excalidraw/index.css`;
	excalidrawStyles ??= (() => {
		const outerStyles = document.createElement("link");
		outerStyles.classList.add(SKIP_HYDRATION_CLASS);
		outerStyles.rel = "stylesheet";
		outerStyles.href = `${EXT_URL}/excalidraw/index.css`;
		document.head.append(outerStyles);
		return outerStyles;
	})();
	const styleOverrides = document.createElement('style');
	styleOverrides.textContent = `:host {
	--zIndex-canvas: 1;
	--zIndex-interactiveCanvas: 2;
	--zIndex-svgLayer: 3;
	--zIndex-wysiwyg: 3;
	--zIndex-canvasButtons: 3;
	--zIndex-layerUI: 4;
	--zIndex-eyeDropperBackdrop: 5;
	--zIndex-eyeDropperPreview: 6;
	--zIndex-hyperlinkContainer: 7;

	--zIndex-modal: 1000;
	--zIndex-popup: 1001;
	--zIndex-toast: 999999;

	--sab: env(safe-area-inset-bottom);
	--sal: env(safe-area-inset-left);
	--sar: env(safe-area-inset-right);
	--sat: env(safe-area-inset-top);
}

.excalidraw .App-menu {
	position: fixed;
	inset-inline: var(--editor-container-padding);
	width: auto;
	padding-left: 0;
}
	
.excalidraw .sidebar-trigger {
	display: none;
}`; // excalidraw styles use :root, which doesnt work inside shadowroots
	shadowRoot.append(styles, styleOverrides, innerWrapper);
	const html = htm.bind(h);
	let canvasActive = false;
	let canvasNeverActive = false;
	const isRelevant = (x: number, y: number) => {
		// if (DEBUG) for (const node of document.querySelectorAll('.test')) node.remove();
		const topEl = document.elementsFromPoint(x, y).find(el => el !== wrapper && (!DEBUG || !el.classList.contains('test')));
		if (!topEl) return false;
		if (topEl.closest(".MathJax, a, img, video, picture, map, [tabindex], button, input, textarea, select, embed, fencedframe, iframe, object, svg, math, canvas, dialog, [contenteditable], [draggable]")) return true;
		for (const child of topEl.childNodes) {
			if (child.nodeType !== Node.TEXT_NODE) continue;
			const range = document.createRange();
			range.selectNode(child);
			const rects = range.getClientRects();
			// if (DEBUG) for (const rect of rects) {
			// 	const overlay = document.createElement("div");
			// 	overlay.classList.add("test");
			// 	overlay.style.position = "fixed";
			// 	overlay.style.backgroundColor = "#8080FF60";
			// 	overlay.style.pointerEvents = "none";
			// 	overlay.style.zIndex = "9999";
			// 	overlay.style.inset = `${rect.top}px ${window.innerWidth - rect.right}px ${window.innerHeight - rect.bottom}px ${rect.left}px`;
			// 	document.body.append(overlay);
			// }
			if (([] as DOMRect[]).some.call(rects, (rect) => x > rect.left && x < rect.right && y > rect.top && y < rect.bottom))
				return true;
		}
		return false;
	};
	let selectionInvalidated = true;
	let _selectionCollapsed = false;
	const selectionCollapsed = () => {
		if (!selectionInvalidated) return _selectionCollapsed;
		selectionInvalidated = false;
		const selection = document.getSelection();
		_selectionCollapsed = !selection || selection.isCollapsed;
		return _selectionCollapsed;
	};
	const moveCb = (e: MouseEvent) => {
		wrapper.style.pointerEvents = !canvasNeverActive
			&& (canvasActive || e.shiftKey
				|| (selectionCollapsed() && !isRelevant(e.pageX, e.pageY))) ? 'all' : 'none';
	};
	document.addEventListener('selectionchange', () => { selectionInvalidated = true; });
	document.addEventListener('mousemove', moveCb, { capture: true });
	wrapper.addEventListener('wheel', e => {
		// Prevent excalidraw's default scroll handling
		e.stopPropagation();
	}, { capture: true });
	render(html`<${Excalidraw} ...${{
		initialData: {
			appState: {
				viewBackgroundColor: 'transparent',
			},
		},
		theme: getTheme(),
		UIOptions: {
			canvasActions: {
				changeViewBackgroundColor: false,
				toggleTheme: false,
			},
		},
		detectScroll: false,
		onChange(_, state) {
			canvasNeverActive = state.activeTool.type === 'hand';
			canvasActive = !canvasNeverActive && !!(
				state.activeTool.type !== "selection"
				|| state.contextMenu
				|| state.selectionElement
				|| Object.values(state.selectedElementIds).some((x) => x)
			);
		},
		excalidrawAPI(api) {
			document.getElementById('page')?.addEventListener('scroll', () => {
				const rect = wrapper.getBoundingClientRect();
				api.updateScene({
					appState: {
						offsetTop: rect.top
					},
				});
			});
		},
		renderTopRightUI() {
			return html`<button class="help-icon" title="Close" onClick=${() => {
				render(null, innerWrapper);
				wrapper.remove();
				document.removeEventListener('mousemove', moveCb, { capture: true });
			}} dangerouslySetInnerHTML=${{ __html: TIMES_ICON }}></button>`;
		},
	} satisfies ExcalidrawProps}/>`, innerWrapper);
	document.getElementById('topofscroll')?.append(wrapper);
}

function createWorkspaceButtons(host: Element) {
	const form = document.createElement('form');
	form.classList.add('__uclearn-workspace-form', SKIP_HYDRATION_CLASS);
	if (host.closest('.que.stack')) {
		const mathButton = document.createElement('button');
		mathButton.innerHTML = `${PLUS_ICON}${TIMES_ICON}${MINUS_ICON}${DIVIDE_ICON}`;
		mathButton.title = 'Open Math Field';
		mathButton.classList.add('__uclearn-workspace-math');
		mathButton.addEventListener('click', e => {
			e.preventDefault();
			e.stopPropagation();
			createMathModal();
		});
		const drawButton = document.createElement('button');
		drawButton.innerHTML = `${EDIT_ICON}`;
		drawButton.title = 'Open Drawing Overlay';
		drawButton.classList.add('__uclearn-workspace-draw');
		drawButton.addEventListener('click', e => {
			e.preventDefault();
			e.stopPropagation();
			createExcalidrawWorkspace();
		});
		form.append(...WORKSPACE_ITEMS.map(({ name, icon, classes, action }) => {
			const btn = document.createElement('button');
			btn.innerHTML = icon;
			btn.title = `Open ${name}`;
			btn.classList.add(...classes);
			btn.addEventListener('click', e => {
				e.preventDefault();
				e.stopPropagation();
				action();
			});
			return btn;
		}));
	}
	host.append(form);
}

let jaxOptionsContainer: HTMLElement | null = null;
let selectedJax: HTMLScriptElement | null = null;
let selectedJaxDisplay = false;
export function initQuizWorkspace() {
	onNodeInsert('.que', '.info', el => {
		createWorkspaceButtons(el);
	});
	const activateJaxOptions = (e: Event) => {
		let el = e.target as Node;
		if (el.parentElement?.classList.contains('MathJax_Display')) el = el.parentElement;
		if (!isElement(el) || !(el.classList.contains('MathJax') || el.classList.contains('MathJax_Display'))) return;
		jaxOptionsContainer ??= (() => {
			const container = document.createElement('form');
			container.id = '__uclearn-jax-options';
			const copyButton = document.createElement('button');
			copyButton.innerHTML = COPY_ICON;
			copyButton.title = 'Copy as LaTeX';
			copyButton.addEventListener('click', e => {
				e.preventDefault();
				e.stopPropagation();
				if (selectedJax) copyTextToClipboard(selectedJaxDisplay ? `$$ ${selectedJax.text} $$` : `$ ${selectedJax.text} $`);
			});
			const editButton = document.createElement('button');
			editButton.innerHTML = EDIT_ICON;
			editButton.title = 'Edit in math field';
			editButton.addEventListener('click', e => {
				e.preventDefault();
				e.stopPropagation();
				if (selectedJax) createMathModal(selectedJax.text);
			});
			container.append(copyButton, editButton);
			return container;
		})();
		const script = el.nextElementSibling;
		if (!script || !isElementTag(script, 'script')) return;
		selectedJax = script;
		selectedJaxDisplay = el.classList.contains('MathJax_Display');
		(selectedJaxDisplay ? el.querySelector('.MathJax') : el)?.append(jaxOptionsContainer);
	};
	document.addEventListener('mouseenter', activateJaxOptions, { capture: true });
	document.addEventListener('focus', activateJaxOptions, { capture: true });
}
