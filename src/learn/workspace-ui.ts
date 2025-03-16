import { MathfieldElement } from "mathlive";
import { onNodeInsert, SKIP_HYDRATION_CLASS } from "./hydration";
import { COPY_ICON, DIVIDE_ICON, EDIT_ICON, MINUS_ICON, PLUS_ICON, TIMES_ICON } from "./icons";
import { moodleDialog } from "./yui-modal";
import { getYUIInstance } from "./lib-hook";
import { initMathField } from "./mathlive-loader";
import { isElement, isElementTag } from "./domutil";
import { copyTextToClipboard } from "./clipboard";

async function createMathModal(value = '') {
	const Dialog = await moodleDialog;
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

function createWorkspaceButtons(host: Element) {
	const form = document.createElement('form');
	form.classList.add('__uclearn-workspace-form', SKIP_HYDRATION_CLASS);
	if (host.closest('.que.stack')) {
		const mathButton = document.createElement('button');
		mathButton.innerHTML = `${PLUS_ICON}${TIMES_ICON}${MINUS_ICON}${DIVIDE_ICON}`;
		mathButton.classList.add('__uclearn-workspace-math');
		mathButton.addEventListener('click', e => {
			e.preventDefault();
			e.stopPropagation();
			createMathModal();
		});
		form.append(mathButton);
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
