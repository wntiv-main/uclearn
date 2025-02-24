import { MathfieldElement } from "mathlive";
import type { Expression } from "@cortex-js/compute-engine";
import "@cortex-js/compute-engine";
import { AMTparseAMtoTeX } from "asciimath";

import { EXT_URL } from "./constants";
import { DEBUG_MATHLIVE } from "../global/constants";

MathfieldElement.soundsDirectory = null;
MathfieldElement.fontsDirectory = `${EXT_URL}/learn/mathlive/`;

export const MATHLIVE_FIELD_CLASS = '__uclearn-mathlive-field';

export const MATH_FIELD_SELECTOR = '.que.stack input:is(.algebraic, .numerical)';

if(DEBUG_MATHLIVE) {
	document.documentElement.classList.add('__uclearn-mathlive-debug');
}

function mathJSONtoStack(mathJson: Expression): string {
	if(typeof mathJson === 'string' || typeof mathJson === 'number') return `${mathJson}`;
	if(!Array.isArray(mathJson)) return '<TODO>'/* TODO */;
	const [op, ...args] = mathJson;
	switch(op) {
		case 'Error': {
			if(args[0] === "'missing'") return '';
			return `<${args}>`;
		}
		case 'Add': {
			const [a, b] = args;
			return `(${mathJSONtoStack(a)} + ${mathJSONtoStack(b)})`;
		}
		case 'Power': {
			const [a, b] = args;
			return `(${mathJSONtoStack(a)})^(${mathJSONtoStack(b)})`;
		}
		case 'Divide': {
			const [a, b] = args;
			return `(${mathJSONtoStack(a)})/(${mathJSONtoStack(b)})`;
		}
		case 'Multiply':
			return args.map(mathJSONtoStack).join('*');
		case 'Ln':
			return `ln(${mathJSONtoStack(args[0])})`;
		case 'Sequence':
			return args.map(mathJSONtoStack).join(' ');
		default:
			return '<TODO>';
	}
}

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
	mathField.addEventListener('mount', () => {
		mathField.menuItems = mathField.menuItems.filter(item => !/color|variant|decoration/.test((item as { id?: string; }).id ?? ''));
	});
	mathField.shadowRoot?.append(styleOverrides);
	mathField.readOnly = field.readOnly;
	mathField.removeExtraneousParentheses = true;
	mathField.smartFence = true;
	mathField.smartSuperscript = true;

	mathField.setValue(AMTparseAMtoTeX(field.value));
	mathField.classList.add(MATHLIVE_FIELD_CLASS);
	mathField.addEventListener('input', e => {
		const mathJson = JSON.parse(mathField.getValue('math-json'));
		console.log(mathJson);
		field.value = mathJSONtoStack(mathJson);
		field.dispatchEvent(new InputEvent('input', e));
	});
	mathField.addEventListener('change', e => { field.dispatchEvent(new InputEvent('change', e)); });
	field.before(mathField);
}
