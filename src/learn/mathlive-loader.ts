import { MathfieldElement } from "mathlive";
import { AMTparseAMtoTeX } from "asciimath";

import { EXT_URL } from "./constants";
import { DEBUG, DEBUG_MATHLIVE } from "../global/constants";
import { isElementTag } from "./domutil";

MathfieldElement.soundsDirectory = null;
MathfieldElement.fontsDirectory = `${EXT_URL}/learn/mathlive/`;

export const MATHLIVE_FIELD_CLASS = '__uclearn-mathlive-field';

export const MATH_FIELD_SELECTOR = ['.que.stack', 'input:is(.algebraic, .numerical)'] as const;

if (DEBUG_MATHLIVE) {
	document.documentElement.classList.add('__uclearn-mathlive-debug');
}

function latexToStack(latex: string) {
	return (new LatexParser(latex)).parse();
}

function depthCheck<A extends unknown[], R>(target: (this: LatexParser, ...args: A) => R, context: ClassMethodDecoratorContext<LatexParser, (this: LatexParser, ...args: A) => R>) {
	if (!DEBUG) return target;
	return function (this: LatexParser, ...args: A) {
		const startDepth = this._depth();
		const result = target.call(this, ...args);
		const depth = this._depth();
		if (depth !== startDepth + +!!result) {
			reportError(new Error(
				result
					? `${String(context.name)} consumed '${result}', left stack in unexpected state (${startDepth} -> ${depth})`
					: `${String(context.name)} did not consume anything, but modified stack (${startDepth} -> ${depth})`,
			));
			const [latex, stack] = this._info();
			console.error('Parser:', this, 'Called:', context.name, 'with', args, 'Final stack state:', stack);
			if (depth > startDepth) {
				let indicator = '';
				for (let i = 0; i < stack[startDepth]; i++) indicator += ' ';
				indicator += '>';
				for (let i = indicator.length; i < stack[depth]; i++) indicator += stack.includes(indicator.length) ? '>' : '-';
				indicator += '|';
				console.error('Source:', `\n${latex}\n${indicator}`);
			} else console.error('Source:', latex);
		}
		return result;
	};
}

class LatexParser {
	readonly #latex: string;
	#i = [0];
	constructor (latex: string) {
		this.#latex = latex;
	}

	_depth() {
		return this.#i.length;
	}

	_info() {
		return [this.#latex, [...this.#i]] as const;
	}

	#consumeRx(regex: RegExp) {
		const i = this.#i.at(-1) ?? 0;
		if (i >= this.#latex.length) return null;
		const rx = new RegExp(`^(?:${regex.source})`);
		const match = this.#latex.slice(i).match(rx);
		if (match) this.#i.push(i + match[0].length);
		return match;
	}

	#consume(regex: RegExp | string) {
		if (typeof regex === 'string') {
			const i = this.#i.at(-1) ?? 0;
			if (i >= this.#latex.length) return false;
			const slice = this.#latex.slice(i);
			if (slice.startsWith(regex)) {
				this.#i.push(i + regex.length);
				return regex;
			}
			return false;
		}
		const match = this.#consumeRx(regex);
		return match?.[0] ?? false;
	}

	static readonly #close = (x: string | false) => !x || /^\(.*\)$/.test(x) ? x : `(${x})`;
	static readonly #closeFactor = (x: string | false) => x && /[-+*/]/.test(x) ? LatexParser.#close(x) : x;
	static readonly #closeExponent = (x: string | false) => x && /[-+*/^]/.test(x) ? LatexParser.#close(x) : x;

	#push() {
		this.#i.push(this.#i.at(-1) ?? 0);
	}

	#commit(n = 1) {
		this.#i.splice(this.#i.length - n - 1, n);
	}

	#pop(n = 1) {
		this.#i.splice(this.#i.length - n, n);
	}

	parse() {
		const result = this.parseExpression();
		this.#commit();
		return result;
	}

	@depthCheck
	parseNum() {
		return this.#consume(/[+-]?\d+(?:\.\d+)?/);
	}

	// TODO: pdiff, binom
	// https://cortexjs.io/mathfield/reference/commands

	@depthCheck
	parseObject(acceptLeadingSign = true): string | false {
		const obj = this.parseNum() || this.parseFunction() || this.parseSymbol() || this.parseD() || this.parseGroup() || this.parsePDiff()
			|| this.parseMacro(/[dt]?frac|cfrac\[[lr]\]/, 2)
				?.map((_, [num, denom]) => `${LatexParser.#closeFactor(num)}/${LatexParser.#closeFactor(denom)}`)
			|| this.parseMacro(/[dt]?frac\d{2}/)?.map(name => {
				const [n, d] = [...name.slice(-2)].map(n => Number.parseInt(n));
				return `${n}/${d}`;
			});
		if (!acceptLeadingSign && obj && /^[+-]/.test(obj)) {
			this.#pop();
			return false;
		}
		const sup = obj && this.parseExp();
		if (sup) {
			this.#commit();
			if (/^'+$/.test(sup)) return `${obj}${sup}`;
			return `${obj}^${LatexParser.#closeExponent(sup)}`;
		}
		return obj ?? false;
	}

	@depthCheck
	parseObjects(acceptLeadingSign = true) {
		let collector = this.parseObject(acceptLeadingSign);
		if (!collector) return false;
		/* eslint-disable-next-line no-cond-assign
		*/// biome-ignore lint/suspicious/noAssignInExpressions: i want it tho
		for (let obj: string | false; obj = this.parseObject(false);) {
			collector += `*${obj}`;
			this.#commit();
		}
		return collector;
	}

	@depthCheck
	parseExpression() {
		this.#push();
		let sums = '';
		let products = '';
		let isStable = true;
		do {
			if (this.#consume(/\s+/)) this.#commit();
			if (this.parseMacro(/[,.:;]/)) this.#commit();

			const obj = this.parseObjects(!products);
			if (obj) {
				this.#commit();
				if (products) products += '*';
				products += obj;
				isStable = true;
				continue;
			}

			const sum = isStable && this.#consume(/[+=-]/) || this.parseMacro('pm')?.map(() => '#pm#');
			if (sum) {
				this.#commit();
				sums += `${products} ${sum} `;
				products = '';
				isStable = false;
				continue;
			}

			const dot = isStable && this.parseMacro('cdot');
			if (dot) {
				this.#commit();
				if (products) products += ' . ';
				isStable = false;
				continue;
			}

			const sep = isStable && this.#consume(/[,;]/);
			if (sep) {
				this.#commit();
				sums += `${products}${sep} `;
				products = '';
				isStable = false;
				continue;
			}
			break;
		} while ((this.#i.at(-1) ?? this.#latex.length) < this.#latex.length);
		if (!isStable) throw new Error(`Incomplete expression: '${products + sums}'`);
		return sums + products;
	}

	@depthCheck
	parseMacro(name: string | RegExp, args = 0) {
		const bs = this.#consume('\\');
		const n = bs && this.#consume(name);
		const argValues: string[] = [];
		if (n) for (let i = 0; i < args; i++) {
			const val = this.parseGroup('{', '}');
			if (!val) break;
			argValues.push(val);
		}
		if (!n || argValues.length < args) {
			this.#pop(+!!bs + +!!n + argValues.length);
			return;
		}
		this.#commit(args + 1);
		if (n && this.#consume(/\s+/)) this.#commit();
		return {
			name: n, args: argValues, map<T>(mapper: (name: string, args: string[]) => T) {
				return mapper(n, argValues);
			}
		};
	}

	@depthCheck
	private _parseN(parser: () => string | false) {
		let collector = '';
		let val = parser();
		while (val) {
			if (collector) this.#commit();
			collector += val;
			val = parser();
		}
		return collector;
	}

	@depthCheck
	parseExp() {
		const exp = this.#consume('^');
		const sup = exp && (
			this.parseNum()
			|| this.parseSymbol()
			|| this.parseD()
			|| this.parseGroup('{', '}', () => this._parseN(
				() => this.parseMacro('doubleprime') ? "''" : this.parseMacro('prime') ? "'" : false))
			|| this.parseGroup(/[{(]/));
		if (sup) {
			this.#commit();
			return sup;
		}
		if (exp) throw [exp, sup, this.#latex, this.#i.at(-1)];
		return false;
	}

	@depthCheck
	parseSub() {
		const score = this.#consume('_');
		const sub = score && (
			this.parseNum()
			|| this.parseSymbol()
			|| LatexParser.#closeExponent(this.parseGroup('{', '}'))
		);
		if (sub) {
			this.#commit();
			return sub;
		}
		if (score) {
			this.#commit();
			return false; // Ignore unnecesary subscript
		}
		return false;
	}

	@depthCheck
	parsePDiff() {
		const frac = this.#consume(/\\(?:[dt]?frac|cfrac\[[lr]\])\s*\{\s*/);
		const p1 = frac && this.parseMacro(/partial\s*/);
		const s1 = p1 && this.parseSymbol();
		const center = s1 && this.#consume(/\s*}\s*{\s*/);
		const p2 = center && this.parseMacro(/partial\s*/);
		const s2 = p2 && this.parseSymbol();
		const end = s2 && this.#consume(/\s*}/);
		const consts = end && this.parseSub();
		if (!end) {
			this.#pop(+!!frac + +!!p1 + +!!s1 + +!!center + +!!p2 + +!!s2);
			return false;
		}
		this.#commit(6);
		if (consts) {
			this.#commit();
			return `pd(${s1}, ${s2}, ${consts})`;
		}
		return `pd(${s1}, ${s2})`;
	}

	@depthCheck
	parseFunction() {
		const fnSym = this.parseSymbol(true);
		const fn = fnSym || this.parseMacro(
			/arc(?:cos|sin|tan)|csc|cosec|sec|(?:cos|sin|tan|cot)h?|exp(?!onentialE)|ln|sqrt|ker|det|arg|dim|gcd|argmin|argmax|plim/)
			?.map(name => ({ cosec: 'csc' }[name] ?? name));
		const sup = fn && this.parseExp();
		const args = fn && LatexParser.#close(this.parseGroup(/(?:\\(?:left)?)?\(|{/) || (!fnSym && this.parseObjects()));
		if (!args) {
			this.#pop(+!!fn + +!!sup);
			return false;
		}
		this.#commit(+!!sup + +!!args);
		if (!sup) return `${fn}${args}`;
		if (sup === '-1') {
			if (/(?:cos|sin|tan)/.test(fn)) return `arc${fn}${args}`;
			return `${{
				'exp': 'ln',
				'ln': 'exp'
			}[fn] ?? `${fn}^-1`}${args}`;
		}
		if (/^'+$/.test(sup)) return `${fn}${sup}${args}`;
		return `(${fn}${args})^${LatexParser.#closeExponent(sup)}`;
	}

	@depthCheck
	parseGroup(open?: string | RegExp, close?: string | RegExp, internals = () => this.parseExpression()) {
		const openFound = this.#consume(open ?? /(?:\\(?:left)?)?[{([]/);
		const expr = openFound && internals();
		const closeFound = expr && this.#consume(close ?? (
			openFound.replace('left', 'right').slice(0, -1)
			+ { '{': '}', '(': ')', '[': ']' }[openFound.slice(-1) ?? '']));
		if (closeFound) {
			this.#commit(2);
			return openFound === '{' ? expr : `${openFound.slice(-1)}${expr}${closeFound.slice(-1)}`;
		}
		this.#pop(+!!openFound + +!!expr);
		return false;
	}

	@depthCheck
	parseD() {
		const d = this.parseMacro('differentialD');
		const space = d && this.#consume(/\s+/);
		const sym = d && this.parseSymbol();
		if (!sym) {
			this.#pop(+!!d + +!!space);
			return false;
		}
		this.#commit(+!!space + 1);
		return `d${sym}`;
	}

	@depthCheck
	parseSymbol(fn = false) {
		let sym = this.#consume(fn ? /(?![abeijkwxyznm])[a-zA-Z]/ : /[a-zA-Z]/)
			|| this.parseMacro(fn ? /log/ : /nabla|theta|pi|exponentialE|imaginaryI|omega/)
				?.map(name => ({ 'exponentialE': 'e', 'imaginaryI': 'i' }[name] ?? name));
		if (!sym) return false;
		const sub = this.parseSub();
		if (sub) {
			sym += `_${sub}`;
			this.#commit();
		}
		return sym;
	}
}

// const depths = new Map<EventTarget, number>();
// const _handle = MathfieldElement.prototype.handleEvent;
// MathfieldElement.prototype.handleEvent = function (e) {
// 	if ((e as { isSimulated?: boolean; }).isSimulated || !e.isTrusted) return;
// 	if (!e.target) return;
// 	const el = e.target;
// 	const depth = (depths.get(el) ?? 0);
// 	if (depth > 5) return;
// 	depths.set(el, depth + 1);
// 	_handle.call(this, e);
// 	if (depth) depths.set(el, depth);
// 	else depths.delete(el);
// };

export function initMathField(mf: MathfieldElement) {
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
	mf.classList.add(MATHLIVE_FIELD_CLASS);
	mf.addEventListener('mount', () => {
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
	mathField.addEventListener("mount", () => {
		for (const [id, locked] of Object.entries(lockStates)) mathField.setPromptState(id, undefined, locked);
	});
	const inputCb = (e: Event) => {
		for (const prompt of mathField.getPrompts()) {
			const fieldLatex = mathField.getPromptValue(prompt, 'latex');
			const field = document.getElementById(prompt);
			if (!field || !isElementTag(field, 'input')) continue;
			field.value = `${latexToStack(fieldLatex)};"__uclearn-mltex-(";${JSON.stringify(fieldLatex)};"__uclearn-mltex-)"`;
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
	mathField.style.minWidth = field.style.minWidth || field.style.width;
	const inputCb = (e: Event) => {
		const fieldLatex = mathField.getValue('latex');
		field.value = `${latexToStack(fieldLatex)};"__uclearn-mltex-(";${JSON.stringify(fieldLatex)};"__uclearn-mltex-)"`;
		field.dispatchEvent(new InputEvent(e.type, e));
	};
	mathField.addEventListener('input', inputCb);
	mathField.addEventListener('change', inputCb);
	field.before(mathField);
}
