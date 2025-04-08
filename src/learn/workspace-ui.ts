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

declare global {
	interface Window {
		EXCALIDRAW_ASSET_PATH: string;
	}
}

window.EXCALIDRAW_ASSET_PATH = `${EXT_URL}/excalidraw/`;

import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawProps } from "@excalidraw/excalidraw/dist/types/excalidraw/types";
import { getTheme } from "./config";

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

function createExcalidrawWorkspace() {
	const wrapper = document.createElement('div');
	wrapper.classList.add(SKIP_HYDRATION_CLASS, '__uclearn-excalidraw-overlay');
	const shadowRoot = wrapper.attachShadow({ mode: 'closed' });
	const innerWrapper = document.createElement('div');
	innerWrapper.style.height = '100%';
	const styles = document.createElement('link');
	styles.rel = 'stylesheet';
	styles.href = `${EXT_URL}/excalidraw/index.css`;
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
    margin-top: calc(-1 * var(--editor-container-padding));
	width: auto;
	padding-left: 0;
}
	
.excalidraw .sidebar-trigger {
	display: none;
}`; // excalidraw styles use :root, which doesnt work inside shadowroots
	shadowRoot.append(styles, styleOverrides, innerWrapper);
	const html = htm.bind(h);
	let canvasActive = false;
	document.addEventListener('mousemove', e => {
		wrapper.style.pointerEvents = canvasActive
			|| e.shiftKey
			|| !document.elementsFromPoint(e.pageX, e.pageY).find(el => el !== wrapper)
				?.closest("a, p, [tabindex], button, input, textarea, [contenteditable]") ? 'all' : 'none';
	}, { capture: true });
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
			canvasActive = !!(
				(state.activeTool.type !== "selection" &&
					state.activeTool.type !== "hand") ||
				state.contextMenu ||
				state.selectionElement ||
				Object.values(state.selectedElementIds).some((x) => x)
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
		form.append(mathButton, drawButton);
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
