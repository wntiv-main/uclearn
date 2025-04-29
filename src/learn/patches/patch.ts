import { DEBUG } from "../../global/constants";

export function getRemappedName(accessor: () => unknown) {
	return accessor.toString().replace(/^\s*(?:\([^)]*\)|\w+)\s*=>\s*((?![0-9])[\w$]+)$|^\s*(?:(?:function\s+\w+|function|\w+)\s*\([^)]*\)|\([^)]*\)\s*=>)\s*{.*return\s+((?![0-9])[\w$]+).*}/, '$1$2');
}

declare global {
	interface Window {
		__uclearn_debug_values: unknown[];
	}
}

window.__uclearn_debug_values = [];
// const remapped_DEBUG_name = getRemappedName(() => DEBUG);
export const patchT: <T>() => <A extends unknown[], R>(
	method: (...args: A) => R,
	transformer: (code: string) => string,
	locals?: { [key: string]: unknown; },
	name?: string,
	skipLog?: boolean) => (...args: A) => T
	= () => DEBUG ? (method, transformer, locals = {}, name?, skipLog = false) => {
		const oldContent = method.toString();
		let newContent = transformer(oldContent);
		if (newContent === oldContent) {
			console.warn('Patch for', name ?? method.name, 'had no change, transform may have failed', transformer, '(', method, ')');
			return method;
		}
		if (!skipLog) {
			const index = window.__uclearn_debug_values.push(locals) - 1;
			newContent = newContent.replace('{', `{\
				console.log("Called",\
					${JSON.stringify(name ?? method.name)},\
					window.__uclearn_debug_values[${index}]);`);
		}
		if (!/^[^{]*=>/.test(newContent)) newContent = newContent.replace(/^(\s*(?:async\s+)?)(?=\w+)(?!function)/, "$1function ");
		const localNames = Object.keys(locals);
		/* eslint-disable-next-line no-empty-character-class
		*/// biome-ignore lint/correctness/noEmptyCharacterClassInRegex: needed to match nothing
		const localRx = localNames.length ? new RegExp(String.raw`(?<![(=!]\s*/.*?/)\b(${localNames.join('|')})\b(?=(?:['"]|[^'"][^'"]*['"])*)`, 'g') : /[]/g;
		return new Function(...localNames.map(local => `$uc_${local}`), `return ${newContent.replaceAll(localRx, '$$uc_$1')};`)(...Object.values(locals));
	} : (method, transformer, locals = {}) => {
		let newContent = transformer(method.toString());
		if (!/^[^{]*=>/.test(newContent)) newContent = newContent.replace(/^(\s*(?:async\s+)?)(?=\w+)(?!function)/, "$1function ");
		const localNames = Object.keys(locals);
		/* eslint-disable-next-line no-empty-character-class
		*/// biome-ignore lint/correctness/noEmptyCharacterClassInRegex: needed to match nothing
		const localRx = localNames.length ? new RegExp(String.raw`(?<![(=!]\s*/.*?/)\b(${localNames.join('|')})\b(?=(?:['"]|[^'"][^'"]*['"])*)`, 'g') : /[]/g;
		return new Function(...localNames.map(local => `$uc_${local}`), `return ${newContent.replaceAll(localRx, '$$uc_$1')};`)(...Object.values(locals));
	};

export const patch = patchT<unknown>();

export const patchObj = <A extends unknown[], R, T extends { [key in S]: (...args: A) => R }, S extends keyof T>(
	obj: T,
	method: S,
	transformer: (code: string) => string,
	locals: { [key: string]: unknown; } = {},
	name?: string,
	skipLog?: boolean,
) => {
	// biome-ignore lint/suspicious/noAssignInExpressions: no u
	return obj[method] = patch(obj[method], transformer, locals, name ?? method.toString(), skipLog) as T[S];
};

const ARGS_RX = /^\s*\w+(?:\s\w*)?\((?<args>.*?)\)|^\s*\((?<args>.*?)\)\s*=>|^\s*(?<args>\w+)\s*=>/;
export const tailHook = <T, R, A extends unknown[]>(func: (...args: A) => T, hook: (mod: T, ...args: A) => R, locals: { [key: string]: unknown; } = {}, label?: string) => {
	const args = func.toString().match(ARGS_RX)?.groups?.args ?? '';
	const hookContents = `((module, ...args) => (${hook.toString()})(module, ...args) ?? module)`;
	return patch(
		func,
		src => {
			const returnPos = src.lastIndexOf('return');
			let endIndex = src.lastIndexOf('}');
			let result: string;
			if (returnPos >= 0 && !Array.prototype.reduce.call<Iterable<string>, [(a: number, b: string) => number, number], number>
				// the end {brace} depth relative to the start
				(src.slice(returnPos + 'return'.length, endIndex), (a, b) => b === '{' ? a + 1 : b === '}' ? a - 1 : a, 0)) {
				result = src.slice(0, returnPos + 'return'.length);
				result += ` (${hookContents})((`;
				while (/[\s;]/.test(src[--endIndex]));
				result += `${src.slice(returnPos + 'return'.length, endIndex + 1)}),${args});${src.slice(endIndex + 1)}`;
			} else {
				result = `${src.slice(0, endIndex)};(${hookContents})(void 0,${args});${src.slice(endIndex)}`;
			}
			return result;
		},
		locals,
		label
	) as (...args: A) => R extends void ? T : R;
};

export const tailHookLocals = <T, R, A extends unknown[], B extends unknown[]>(
	func: (...args: A) => T,
	captureLocals: { [K in keyof B]: string },
	hook: (...args: B) => R,
	locals: { [key: string]: unknown; } = {},
	label?: string,
	transformer: (src: string) => string = x => x,
) => {
	const args = func.toString().match(ARGS_RX)?.groups?.args ?? '';
	const content = `(${hook.toString()})(${captureLocals}, ${args});`;
	return patch(
		func,
		// biome-ignore lint/correctness/noEmptyCharacterClassInRegex: intentional, match all
		src => transformer(src).replace(/\{([^]*)\}/, `{try{\n$1\n}finally{${content}}}`),
		locals,
		label
	) as (...args: A) => (R extends void ? T : R extends false | '' | 0 | null | undefined ? T : R);
};
