import { MathfieldElement } from "mathlive";
import { AMTparseAMtoTeX } from "asciimath";

import { EXT_URL } from "./constants";
import { DEBUG, DEBUG_MATHLIVE } from "../global/constants";
import { isElementTag } from "./domutil";
import { enumerate, type ItemOf } from "../global/util";

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

	static readonly #close = <T extends string | false | null | undefined>(x: T) => !x ? x : `(${LatexParser.#unwrap(x)})`;
	static readonly #closeFactor = <T extends string | false | null | undefined>(x: T) => x && /[-+*/.]/.test(x) ? LatexParser.#close(x) : x;
	static readonly #closeExponent = <T extends string | false | null | undefined>(x: T) => x && /[-+*/.^]/.test(x) ? LatexParser.#close(x) : x;
	static readonly #unwrap = <T extends string | false | null | undefined>(x: T) => {
		if (!x || !x.startsWith('(') || !x.endsWith(')')) return x;
		let depth = 0;
		for (const ch of x.slice(1, -1)) {
			if (ch === '(') depth++;
			else if (ch === ')') {
				depth--;
				if (depth < 0)
					return x;
			}
		}
		return x.slice(1, -1);
	};

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
		try {
			const result = this.parseExpression(true);
			if (result) this.#commit();
			if (this.#i[0] < this.#latex.length)
				return [null, new Error(`Could not parse '${this.#latex.slice(this.#i[0])}'`)] as const;
			return [result, null] as const;
		} catch (e) {
			return [null, e as Error] as const;
		}
	}

	parseNum() {
		return this.#consume(/[+-]?\d+(?:\.\d+)?/);
	}

	// TODO: pdiff, binom
	// https://cortexjs.io/mathfield/reference/commands

	parseObject(acceptLeadingSign = true, acceptSecondary = true): string | false {
		const parse = acceptSecondary ? this.parseExpression : () => this.parseObject(acceptLeadingSign, false);
		const obj = acceptSecondary && (this.parseNum() ||
			this.parseMacro(/sqrt\d/)?.map((name) => `sqrt(${name.slice(-1)})`) ||
			this.parseFunction())
			|| this.parseSymbol()
			|| acceptSecondary && (this.parseD() ||
				this.parseGroup() ||
				this.parsePDiff() ||
				this.parseMacro(/[dt]?frac|cfrac\[[lr]\]/, [{}, {}])?.map(
					(_, [num, denom]) =>
						`(${LatexParser.#closeFactor(num.value)}/${LatexParser.#closeFactor(denom.value)})`,
				) ||
				this.parseMacro(/[dt]?frac\d{2}/)?.map((name) => {
					const [n, d] = [...name.slice(-2)].map((n) => Number.parseInt(n));
					return `(${n}/${d})`;
				}))
			|| this.parseMacro(/(?:display|text|script|scriptscript)style|math(?:punct|inner|ord|bfit|bf|it|tt|sf|frak|scr|cal|bb|rm)|boxed|boldsymbol|bold|bm|emph|tiny|small|[lL]arge|LARGE|[hH]uge|(?:script|footnote|normal)size|displaylines/,
				[{ parse }])?.map((_, args) => {
					return args[0].value;
				})
			|| this.parseMacro('mathopen', [{ parse }])?.map((_, args) => {
				return `${args[0].value} `;
			})
			|| this.parseMacro('mathclose', [{ parse }])?.map((_, args) => {
				return ` ${args[0].value}`;
			})
			|| this.parseMacro(/math(?:op|rel|bin)/, [{ parse }])?.map((_, args) => {
				return ` ${args[0].value} `;
			})
			|| this.parseMacro(/(?:text)?color|colorbox/,
				[{ parse: this.parseText }, { parse }])?.map((_, args) => {
					return args[1].value;
				})
			|| this.parseMacro('fcolorbox',
				[{ parse: this.parseText }, { parse: this.parseText }, { parse }])?.map((_, args) => {
					return args[2].value;
				})
			|| this.parseMacro(/text(?:rm|md|bf|up|it|sl|tt|sf|normal)?|mbox/, [{ parse: this.parseText }])?.map((_, args) => args[0].value)
			|| this.parseMacro('textsc', [{ parse: this.parseText }])?.map((_, args) => args[0].value.toUpperCase());
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

	parseObjects(acceptLeadingSign = true) {
		let collector = this.parseObject(acceptLeadingSign);
		if (!collector) return false;
		/* eslint-disable-next-line no-cond-assign
		*/// biome-ignore lint/suspicious/noAssignInExpressions: i want it tho
		for (let obj: string | false; obj = this.parseObject(false, false);) {
			collector += `*${obj}`;
			this.#commit();
		}
		return collector;
	}

	parseExpression(allowEmpty = false) {
		this.#push();
		let sums = '';
		let products = '';
		let prodIsStable = false;
		do {
			if (this.#consume(/\s+/)) this.#commit();
			if (this.parseMacro(/[,.:;]|enskip|enspace|q?quad|strut|mathstrut/) || this.parseMacro(/hspace\*?/, [{ parse: this.parseText }])) {
				if (products && !products.endsWith(' ')) products += ' ';
				else if (sums && !sums.endsWith(' ')) sums += ' ';
				this.#commit();
			}

			const obj = this.parseObjects(!products);
			if (obj) {
				this.#commit();
				if (prodIsStable) {
					products = products.trimEnd();
					products += '*';
				}
				products += obj;
				prodIsStable = true;
				continue;
			}

			const sum = (prodIsStable || !products) && this.#consume(/[+=-]/) || this.parseMacro('pm')?.map(() => '#pm#');
			if (sum) {
				this.#commit();
				sums += !products.trimEnd() ? sum : `${products.trimEnd()} ${sum} `;
				products = '';
				prodIsStable = false;
				continue;
			}

			const dot = prodIsStable && this.parseMacro(/cdot|cross/);
			if (dot) {
				this.#commit();
				if (products) {
					products = products.trimEnd();
					products += { cdot: " . ", cross: " * " }[dot.name];
				}
				prodIsStable = false;
				continue;
			}

			const sep = prodIsStable && this.#consume(/[,;]/);
			if (sep) {
				this.#commit();
				sums += `${products.trimEnd()}${sep} `;
				products = '';
				continue;
			}
			break;
			// biome-ignore lint/style/noNonNullAssertion: #i must always be of atleast length 1
		} while (this.#i.at(-1)! < this.#latex.length);
		if (allowEmpty && !sums && !products) {
			this.#pop();
			return "";
		}
		if (!prodIsStable) throw new Error(`Incomplete expression: '${products + sums}'`);
		return sums + products;
	}

	parseMacro<T>(name: string | RegExp, args: ({ id?: T, parse?: () => string | false | undefined, optional?: boolean; })[] = []) {
		const bs = this.#consume('\\');
		const n = bs && this.#consume(name);
		if (n && this.#consume(/\s+/)) this.#commit();
		const argValues: (ItemOf<typeof args> & { value: string; })[] = [];
		if (n) for (const [i, { id, parse, optional }] of enumerate(args)) {
			const value = this.parseGroup('{', '}', parse);
			if (!optional && !value) {
				this.#pop(+!!bs + +!!n + i);
				return;
			}
			if (!value) this.#push(); // for simplicity
			else argValues.push({ id, parse, optional, value });
		}
		if (!n) {
			this.#pop(+!!bs + (n ? 1 + args.length : 0));
			return;
		}
		this.#commit(args.length + 1);
		return {
			name: n, args: argValues, map<T>(mapper: (name: string, args: typeof argValues) => T) {
				return mapper(n, argValues);
			}
		};
	}

	parseText() {
		// TODO: parse args properly
		const text = this.#consumeRx(/[^{}]*/)?.[0]
			.replaceAll('\\textleftbrace', '{')
			.replaceAll('\\textrightbrace', '}')
			.replaceAll('\\textbackslash', '\\');
		const itsNotConstantLinters = (text && false) ?? true;
		return itsNotConstantLinters ? false : JSON.stringify(text);
	}

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

	parseExp() {
		const exp = this.#consume('^');
		const sup = exp && (this.#consume(/\d/) || LatexParser.#closeExponent(this.parseObject()));
		if (sup) {
			this.#commit();
			return sup;
		}
		if (exp) throw new Error('Caret (^) with no exponent expression');
		return false;
	}

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

	parseFunction() {
		const fnSym = this.parseSymbol(true);
		const fn = fnSym
			|| this.parseMacro(/operatorname\*?/, [{ parse: () => this.parseSymbol() }])
				?.map((_, [{ value: name }]) => name)
			|| this.parseMacro(
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

	parseGroup(open?: string | RegExp, close?: string | RegExp, internals: () => string | false | undefined = () => this.parseExpression()) {
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

	parseD() {
		const d = this.parseMacro(/differentialD|differencedelta/);
		const space = d && this.#consume(/\s+/);
		const sym = d && this.parseSymbol();
		if (!sym) {
			this.#pop(+!!d + +!!space);
			return false;
		}
		this.#commit(+!!space + 1);
		return `${d.name === 'differentialD' ? 'd' : 'delta'}${sym}`;
	}

	parseSymbol(fn = false) {
		let sym = this.#consume(fn ? /(?![abeijkwxyznm])[a-zA-Z]/ : /[a-zA-Z]/)
			|| this.parseMacro(fn ? /log/ : /nabla|exponentialE|imaginaryI|aleph|beth|gimel|daleth|[aA]lpha|[bB]eta|[gG]amma|varGamma|[dD]elta|varDelta|[eE]psilon|varepsilon|[zZ]eta|[eE]ta|[tT]heta|vartheta|[iI]ota|[kK]appa|varkappa|[lL]ambda|[mM]u|[nN]u|[xX]i|varXi|[oO]micron|[pP]i|var[pP]i|[rR]ho|varrho|[sS]igma|var[sS]igma|[tT]au|[pP]hi|var[pP]hi|[uU]psilon|varUpsilon|[cC]hi|[pP]si|varPsi|[oO]mega|varOmega|digamma/)
				?.map(name => ({ 'exponentialE': 'e', 'imaginaryI': 'i', 'varepsilon': 'epsilon', 'vartheta': 'theta', 'varkappa': 'kappa', 'varpi': 'pi', 'varPi': 'Pi', 'varrho': 'rho', 'varsigma': 'sigma', 'varSigma': 'Sigma', 'varphi': 'phi', 'varPhi': 'Phi', 'varGamma': 'Gamma', 'varDelta': 'Delta', 'varXi': 'Xi', 'varUpsilon': 'Upsilon', 'varPsi': 'Psi', 'varOmega': 'Omega' }[name] ?? name));
		if (!sym) return false;
		const sub = this.parseSub();
		if (sub) {
			sym += `_${sub}`;
			this.#commit();
		}
		return sym;
	}
}

if (DEBUG) for (const key of Object.getOwnPropertyNames(LatexParser.prototype)) {
	if (!/^[#_]?parse\w+$/.test(key)) continue;
	const _inner = LatexParser.prototype[key as keyof LatexParser] as (...args: unknown[]) => unknown;
	LatexParser.prototype[key as keyof LatexParser] = function (this: LatexParser, ...args: unknown[]) {
		const startDepth = this._depth();
		const result = _inner.call(this, ...args);
		const depth = this._depth();
		if (depth !== startDepth + +!!result) {
			reportError(new Error(
				result
					? `${key} consumed '${result}', left stack in unexpected state (${startDepth} -> ${depth})`
					: `${key} did not consume anything, but modified stack (${startDepth} -> ${depth})`,
			));
			const [latex, stack] = this._info();
			console.error('Parser:', this, 'Called:', key, 'with', args, 'Final stack state:', stack);
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
	} as never; // ignore type
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
	return (mf as unknown as { _internals: ElementInternals; })._internals;
}

export function initMatrixField(field: HTMLElement) {
	const mathField = new MathfieldElement({});
	mathField.readOnly = true;
	const internals = initMathField(mathField);
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
			const [stack, err] = latexToStack(fieldLatex);
			if (err) {
				mathField.style.borderColor = 'red';
				internals.setValidity({ customError: true }, err.message);
				return;
			}
			field.value = `${stack};"__uclearn-mltex-(";${JSON.stringify(fieldLatex)};"__uclearn-mltex-)"`;
			field.dispatchEvent(new InputEvent(e.type, e));
		}
		internals.setValidity({});
		mathField.style.borderColor = 'currentColor';
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
	const internals = initMathField(mathField);

	const fieldValue = field.value.match(/;"__uclearn-mltex-\(";(".*");"__uclearn-mltex-\)"/);
	mathField.setValue(fieldValue ? JSON.parse(fieldValue[1]) : AMTparseAMtoTeX(field.value.split(';')[0]));
	mathField.style.minWidth = field.style.minWidth || field.style.width;
	const inputCb = (e: Event) => {
		const fieldLatex = mathField.getValue('latex');
		const [stack, err] = latexToStack(fieldLatex);
		if (err) {
			mathField.style.borderColor = 'red';
			if (DEBUG) console.error(err);
			internals.setValidity({ customError: true }, err.message);
			return;
		}
		internals.setValidity({});
		mathField.style.borderColor = 'currentColor';
		field.value = `${stack};"__uclearn-mltex-(";${JSON.stringify(fieldLatex)};"__uclearn-mltex-)"`;
		field.dispatchEvent(new InputEvent(e.type, e));
	};
	mathField.addEventListener('input', inputCb);
	mathField.addEventListener('change', inputCb);
	field.before(mathField);
}
