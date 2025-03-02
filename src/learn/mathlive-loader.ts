import { MathfieldElement } from "mathlive";
import type { Expression } from "@cortex-js/compute-engine";
import "@cortex-js/compute-engine";
import { AMTparseAMtoTeX } from "asciimath";

import { EXT_URL } from "./constants";
import { DEBUG_MATHLIVE } from "../global/constants";
import { isElementTag } from "./domutil";

MathfieldElement.soundsDirectory = null;
MathfieldElement.fontsDirectory = `${EXT_URL}/learn/mathlive/`;
let engineInitialized = false;

export const MATHLIVE_FIELD_CLASS = '__uclearn-mathlive-field';

export const MATH_FIELD_SELECTOR = '.que.stack input:is(.algebraic, .numerical)';

if (DEBUG_MATHLIVE) {
	document.documentElement.classList.add('__uclearn-mathlive-debug');
}

const bracketIfNeededFactor = (x: string) => /[-+*/]/.test(x) ? `(${x})` : x;
const bracketIfNeededExponent = (x: string) => /[-+*/^]/.test(x) ? `(${x})` : x;

function mathJSONtoStack(mathJson: Expression): string {
	if (typeof mathJson === 'string' || typeof mathJson === 'number') switch (mathJson) {
		case 'ExponentialE':
			return 'e';
		case 'Pi':
			return 'pi';
		case 'CatalanConstant':
			return 'G'; // ?
		case 'Nothing':
			return '';
		case 'EmptySet':
			return '{}';
		default: {
			const sym = `${mathJson}`.replaceAll("'", '"');
			if (sym.includes('_'))
				return sym.split('_').map(mathJSONtoStack).join('_');
			return sym;
		}
	}
	if (!Array.isArray(mathJson)) {
		const obj = mathJson as Exclude<typeof mathJson, readonly unknown[]>;
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
		if ('sym' in obj) return mathJSONtoStack(obj.sym);
		if ('fn' in obj) return mathJSONtoStack(obj.fn);
		return '<TODO>' as never;
	}
	const [op, ...args] = mathJson as Extract<Expression, readonly unknown[]>;
	switch (op) {
		case 'Error': {
			if (args[0] === "'missing'") return '';
			return `<${args}>`;
		}
		case 'Equal': {
			const [a, b] = args;
			return `${mathJSONtoStack(a)} = ${mathJSONtoStack(b)}`;
		}
		case 'NotEqual': {
			const [a, b] = args;
			return `${mathJSONtoStack(a)} != ${mathJSONtoStack(b)}`;
		}
		case 'Greater': {
			const [a, b] = args;
			return `${mathJSONtoStack(a)} > ${mathJSONtoStack(b)}`;
		}
		case 'GreaterEqual': {
			const [a, b] = args;
			return `${mathJSONtoStack(a)} >= ${mathJSONtoStack(b)}`;
		}
		case 'Less': {
			const [a, b] = args;
			return `${mathJSONtoStack(a)} < ${mathJSONtoStack(b)}`;
		}
		case 'LessEqual': {
			const [a, b] = args;
			return `${mathJSONtoStack(a)} <= ${mathJSONtoStack(b)}`;
		}
		case 'Mod': {
			const [a, b] = args;
			return `${bracketIfNeededFactor(mathJSONtoStack(a))} % ${bracketIfNeededFactor(mathJSONtoStack(b))}`;
		}
		case 'Add':
			return args.map(mathJSONtoStack).join(' + ');
		case 'Subtract':
			return args.map(mathJSONtoStack).join(' - ');
		case 'Power': {
			const [a, b] = args;
			return `${bracketIfNeededExponent(mathJSONtoStack(a))}^${bracketIfNeededExponent(mathJSONtoStack(b))}`;
		}
		case 'Superscript': {
			const [a, b] = args;
			return `${bracketIfNeededExponent(mathJSONtoStack(a))}^${bracketIfNeededExponent(mathJSONtoStack(b))}`;
		}
		case 'Subscript': {
			const [a, b] = args;
			return `${bracketIfNeededExponent(mathJSONtoStack(a))}[${mathJSONtoStack(b)}]`;
		}
		case 'Root': {
			const [a, b] = args;
			return `${bracketIfNeededExponent(mathJSONtoStack(a))}^(1/${bracketIfNeededFactor(mathJSONtoStack(b))})`;
		}
		case 'Square': {
			const [a] = args;
			return `${bracketIfNeededExponent(mathJSONtoStack(a))}^2`;
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
		case 'Log': {
			const [value, base = 10] = args;
			return `log_${bracketIfNeededExponent(mathJSONtoStack(base))}(${mathJSONtoStack(value)})`;
		}
		case 'Lb': {
			const [value] = args;
			return `log_2(${mathJSONtoStack(value)})`;
		}
		case 'Lg': {
			const [value] = args;
			return `log_10(${mathJSONtoStack(value)})`;
		}
		case 'LogOnePlus': {
			const [value] = args;
			return `ln(1 + ${mathJSONtoStack(value)})`;
		}
		case 'pd':
		case 'Abs':
		case 'Ceil':
		case 'Floor':
		case 'Round':
		case 'Max':
		case 'Min':
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
		// case 'Sequence':
		// 	return args.map(mathJSONtoStack).join(' ');
		case 'Set':
			return `{${args.map(mathJSONtoStack).join(', ')}}`;
		case 'List':
			return `[${args.map(mathJSONtoStack).join(', ')}]`;
		case 'Complex': {
			const [a, b] = args.map(mathJSONtoStack);
			const i = b === '1' ? 'i' : `${bracketIfNeededFactor(b)}*i`;
			return b === '0' ? a
				: a === '0' ? i
					: `${a} + ${i}`;
		}
		case 'PartialDerivative':
			return `pd(${args})`;
		case 'Tuple':
			if (Array.isArray(args[0]) && args[0][0] === 'Error' && args[0][1] === "'unexpected-command'") {
				if (args[0][2][1] === "'\\differentialD'")
					return `d${args.slice(1).map(mathJSONtoStack).join('')}`;
			}
			// if (args.length === 2) {
			// 	const [name, fnArgs] = args;
			// 	if (Array.isArray(fnArgs) && fnArgs[0] === 'Tuple')
			// 		return `${mathJSONtoStack(name)}(${(fnArgs as Extract<Expression, readonly unknown[]>).slice(1).map(mathJSONtoStack).join(', ')})`;
			// 	return `${mathJSONtoStack(name)}(${mathJSONtoStack(fnArgs)})`;
			// }
			return `<TODO: ${op}(${args.map(mathJSONtoStack)})>`;
		default:
			return `<TODO: ${op}(${args.map(mathJSONtoStack)})>`;
	}
}

function initMathField(mf: MathfieldElement) {
	const styleOverrides = document.createElement('style');
	styleOverrides.textContent = `
		:host .ML__caret {
			display: inline-flex;
			align-items: center;
			vertical-align: middle;
		}

		:host .ML__caret::after {
			position: absolute;
			height: 1lh;
			inset: auto;
		}

		:host .ML__prompt {
			margin-top: 0.2em;
		}
	`;
	mf.shadowRoot?.append(styleOverrides);
	mf.removeExtraneousParentheses = true;
	mf.smartFence = true;
	mf.smartSuperscript = true;
	mf.addEventListener('mount', () => {
		if (!engineInitialized && MathfieldElement.computeEngine) {
			MathfieldElement.computeEngine.declare("pd", {
				signature: "(unknown, unknown, ...unknown) -> unknown",
			});
			engineInitialized = true;
		}
		mf.menuItems = mf.menuItems.filter(item => !/color|variant|decoration/.test((item as { id?: string; }).id ?? ''));
		mf.keybindings = [
			...mf.keybindings,
			{ key: 'alt+,', ifMode: 'math', command: 'addColumnAfter' },
			{ key: 'shift+alt+,', ifMode: 'math', command: 'addColumnBefore' },
			{ key: 'alt+;', ifMode: 'math', command: 'addRowAfter' },
			{ key: 'shift+alt+;', ifMode: 'math', command: 'addRowBefore' },
		];
		mf.inlineShortcuts = {
			...mf.inlineShortcuts,
			pd: '\\operatorname{pd}'
		};
	});
}

export function initMatrixField(field: HTMLElement) {
	const mathField = new MathfieldElement({});
	mathField.readOnly = true;
	initMathField(mathField);
	const rows = [...field.querySelectorAll('tr')];
	const env = field.classList.contains('matrixroundbrackets') ? 'pmatrix'
		: field.classList.contains('matrixsquarebrackets') ? 'bmatrix'
			: field.classList.contains('matrixbarbrackets') ? 'vmatrix'
				: 'matrix';
	const lockStates: Record<string, boolean> = {};
	mathField.setValue(`\
		\\begin{${env}}
			${rows.map(row => {
		const cells = [...row.querySelectorAll<HTMLInputElement>('td > input[data-stack-input-type="matrix"]')];
		return cells.map(cell => {
			const fieldValue = cell.value.match(/;"__uclearn-mltex-\(";(".*");"__uclearn-mltex-\)"/);
			const cellValue = fieldValue ? JSON.parse(fieldValue[1]) : AMTparseAMtoTeX(cell.value.split(';')[0]);
			lockStates[cell.id] = cell.readOnly;
			return `\\placeholder[${cell.id}]{${cellValue}}`;
		}).join('&');
	}).join('\\\\')}
		\\end{${env}}`);
	for(const [id, locked] of Object.entries(lockStates)) mathField.setPromptState(id, undefined, locked);
	mathField.classList.add(MATHLIVE_FIELD_CLASS);
	const inputCb = (e: Event) => {
		for (const prompt of mathField.getPrompts()) {
			const mathJson = JSON.parse(mathField.getPromptValue(prompt, 'math-json'));
			const fieldLatex = mathField.getPromptValue(prompt, 'latex');
			const field = document.getElementById(prompt);
			if (!field || !isElementTag(field, 'input')) continue;
			field.value = `${mathJSONtoStack(mathJson)};"__uclearn-mltex-(";${JSON.stringify(fieldLatex)};"__uclearn-mltex-)"`;
			field.dispatchEvent(new InputEvent(e.type, e));
		}
	};
	mathField.addEventListener('input', inputCb);
	mathField.addEventListener('change', inputCb);
	field.before(mathField);
}

export function initField(field: HTMLInputElement & ChildNode) {
	const mathField = new MathfieldElement({
		contentPlaceholder: field.placeholder,
	});
	mathField.readOnly = field.readOnly;
	initMathField(mathField);

	const fieldValue = field.value.match(/;"__uclearn-mltex-\(";(".*");"__uclearn-mltex-\)"/);
	mathField.setValue(fieldValue ? JSON.parse(fieldValue[1]) : AMTparseAMtoTeX(field.value.split(';')[0]));
	mathField.classList.add(MATHLIVE_FIELD_CLASS);
	mathField.style.minWidth = field.style.minWidth || field.style.width;
	const inputCb = (e: Event) => {
		const mathJson = JSON.parse(mathField.getValue('math-json'));
		const fieldLatex = mathField.getValue('latex');
		field.value = `${mathJSONtoStack(mathJson)};"__uclearn-mltex-(";${JSON.stringify(fieldLatex)};"__uclearn-mltex-)"`;
		field.dispatchEvent(new InputEvent(e.type, e));
	};
	mathField.addEventListener('input', inputCb);
	mathField.addEventListener('change', inputCb);
	field.before(mathField);
}
