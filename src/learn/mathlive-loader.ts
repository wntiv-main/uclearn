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

if (DEBUG_MATHLIVE) {
	document.documentElement.classList.add('__uclearn-mathlive-debug');
}

const bracketIfNeededFactor = (x: string) => /[-+*/]/.test(x) ? `(${x})` : x;
const bracketIfNeededExponent = (x: string) => /[-+*/^]/.test(x) ? `(${x})` : x;

function mathJSONtoStack(mathJson: Expression): string {
	if (typeof mathJson === 'string' || typeof mathJson === 'number') return `${mathJson}`.replaceAll("'", '"');
	if (!Array.isArray(mathJson)) {
		const obj = mathJson as Exclude<typeof mathJson, readonly unknown[]>;
		// if(mathJson)
		if ('num' in obj) return obj.num;
		/* TODO: The following characters in a string representing a number are ignored:
			U+0009	TAB
			U+000A	LINE FEED
			U+000B	VERTICAL TAB
			U+000C	FORM FEED
			U+000D	CARRIAGE RETURN
			U+0020	SPACE
			U+00A0	UNBREAKABLE SPACE
		*/
		if ('str' in obj) return JSON.stringify(obj.str);
		if ('sym' in obj) return obj.sym;
		if ('fn' in obj) return mathJSONtoStack(obj.fn);
		return '<TODO>' as never;
	}// return '<TODO>'/* TODO */;
	const [op, ...args] = mathJson as Extract<Expression, readonly unknown[]>;
	switch (op) {
		case 'Error': {
			if (args[0] === "'missing'") return '';
			return `<${args}>`;
		}
		case 'Add': {
			return args.map(mathJSONtoStack).join(' + ');
		}
		case 'Power': {
			const [a, b] = args;
			return `${bracketIfNeededExponent(mathJSONtoStack(a))}^${bracketIfNeededExponent(mathJSONtoStack(b))}`;
		}
		case 'Root': {
			const [a, b] = args;
			return `${bracketIfNeededExponent(mathJSONtoStack(a))}^(1/${bracketIfNeededFactor(mathJSONtoStack(b))})`;
		}
		case 'Rational':
		case 'Divide': {
			const [a, b] = args;
			return `${bracketIfNeededFactor(mathJSONtoStack(a))}/${bracketIfNeededFactor(mathJSONtoStack(b))}`;
		}
		case 'Multiply':
			return args.map(mathJSONtoStack).map(bracketIfNeededFactor).join('*');
		case 'Negate':
			return `-${bracketIfNeededExponent(mathJSONtoStack(args[0]))}`;
		case 'Function': {
			const [name, ...fnArgs] = args;
			return `${name}(${fnArgs.map(mathJSONtoStack).join(', ')})`;
		}
		case 'Interval': {
			const [start, end] = args as [['Open' | 'Closed', Expression], ['Open' | 'Closed', Expression]];
			return `${start[0] === 'Open' ? 'o' : 'c'}${end[0] === 'Open' ? 'o' : 'c'
				}(${mathJSONtoStack(start[1])}, ${mathJSONtoStack(end[1])})`;
		}
		case 'Ln':
		case 'Exp':
		case 'Cos':
		case 'Sin':
		case 'Tan':
		case 'Cot':
		case 'Sec':
		case 'Csc':
		case 'Cosh':
		case 'Sinh':
		case 'Tanh':
		case 'Coth':
		case 'Sech':
		case 'Csch':
		case 'Sqrt':
			return `${op.toLowerCase()}(${args.map(mathJSONtoStack).join(', ')})`;
		case 'Arccos':
		case 'Arcsin':
		case 'Arctan':
		case 'Arccot':
		case 'Arcsec':
		case 'Arccsc':
		case 'Arccosh':
		case 'Arcsinh':
		case 'Arctanh':
		case 'Arccoth':
		case 'Arcsech':
		case 'Arccsch':
			return `${op.replace('Arc', 'a')}(${args.map(mathJSONtoStack).join(', ')})`;
		case 'Sequence':
			return args.map(mathJSONtoStack).join(' ');
		case 'Complex': {
			const [a, b] = args;
			return `${mathJSONtoStack(a)} + ${bracketIfNeededFactor(mathJSONtoStack(b))}*i`;
		}
		default:
			return `<TODO: ${op}${args}>`;
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
