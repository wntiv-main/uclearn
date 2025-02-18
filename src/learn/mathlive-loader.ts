import { MathfieldElement } from "mathlive";
import { AMTparseAMtoTeX } from "asciimath";

import { EXT_URL } from "./constants";

MathfieldElement.soundsDirectory = null;
MathfieldElement.fontsDirectory = `${EXT_URL}/learn/mathlive/`;

export const MATHLIVE_FIELD_CLASS = '__uclearn-mathlive-field';

export const MATH_FIELD_SELECTOR = '.que.stack input:is(.algebraic, .numerical)';

export function initField(field: HTMLInputElement & ChildNode) {
	const mathField = new MathfieldElement({
		contentPlaceholder: field.placeholder,
	});
	const styleOverrides = document.createElement('style');
	styleOverrides.textContent = `
		:host .ML__caret {
			position: relative;
		}

		:host .ML__caret::after {
			position: absolute;
			height: 1lh;
			bottom: calc(0.5em - 0.5lh);
		}
	`;
	mathField.shadowRoot?.append(styleOverrides);
	mathField.readOnly = field.readOnly;
	mathField.menuItems = mathField.menuItems.filter(item => !(item as { id?: string; }).id?.includes('color'));
	mathField.removeExtraneousParentheses = true;
	mathField.smartFence = true;
	mathField.smartSuperscript = true;

	mathField.setValue(AMTparseAMtoTeX(field.value));
	mathField.classList.add(MATHLIVE_FIELD_CLASS);
	mathField.addEventListener('input', () => { field.value = mathField.getValue('ascii-math'); });
	mathField.addEventListener('change', e => { field.dispatchEvent(new InputEvent('change', e)); });
	field.before(mathField);
}
