import { courseIcons, initCms } from './ucpatches/course-sidebar';
import { DatabaseHandler, type DBStore, uclearnDB } from './db';
import { DEBUG } from "./debug-options";
import { getRemappedName } from './util';
import { getRequire, hookYUI } from './lib-hook';
import type { YUI } from 'yui';

// const WASM_URL = `${new URL((document.currentScript as HTMLScriptElement).src).origin}/src/wasm/pkg/wasm.js`;

declare global {
	export interface Window {
		__uclearn_hooks: {
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			_debug_values: any[],
			templateCacheGet(courseId: string): Promise<Partial<DBStore<typeof uclearnDB, 'courseIndex'>>>,
			templateCacheSet(courseId: string, value: { html: string, js: string; }): Promise<void>,
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			optimizedRender<T extends any[]>(
				_templates: {
					default: {
						renderForPromise(...args: T): PromiseLike<{ html: string, js: string; }>;
					};
				},
				...args: T): PromiseLike<{ html: string, js: string; }>;
		};
	}
}

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type Callable = (...args: any[]) => any;

const remapped_DEBUG_name = getRemappedName(() => DEBUG);
const patch = <T extends Callable>(
	method: T,
	transformer: (code: string) => string,
	skipLog?: boolean,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	locals: { [key: string]: any; } = {},
	name?: string) => {
	const oldContent = method.toString();
	let newContent = transformer(oldContent);
	if (DEBUG && newContent === oldContent) {
		console.warn('Patch for', name ?? method.name, 'had no change, transform may have failed', transformer, '(', method, ')');
		return method;
	}
	locals[remapped_DEBUG_name] ??= DEBUG;
	if (DEBUG && !skipLog) {
		const index = window.__uclearn_hooks._debug_values.push(locals) - 1;
		newContent = newContent.replace('{', `{console.log("Called", ${JSON.stringify(name ?? method.name)}, window.__uclearn_hooks._debug_values[${index}]);`);
	}
	if (!/^[^{]*=>/.test(newContent)) newContent = newContent.replace(/^(\s*(?:async\s+)?)(?=\w+)(?!function)/, "$1function ");
	const localNames = Object.keys(locals);
	// biome-ignore lint/correctness/noEmptyCharacterClassInRegex: needed to match nothing
	const localRx = localNames.length ? new RegExp(String.raw`(?<![(=!]\s*/.*?/)\b(${localNames.join('|')})\b(?=(?:['"]|[^'"][^'"]*['"])*)`, 'g') : /[]/g;
	return new Function(...localNames.map(local => `__uclrn_${local}`), `return ${newContent.replaceAll(localRx, '__uclrn_$1')};`)(...Object.values(locals));
};
const patchObj = <T extends { [key in S]: M }, S extends keyof T, M extends Callable>(
	obj: T,
	method: S,
	transformer: (code: string) => string,
	skipLog?: boolean,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	locals: { [key: string]: any; } = {},
	name?: string) => {
	// biome-ignore lint/suspicious/noAssignInExpressions: no u
	return obj[method] = patch(obj[method], transformer, skipLog, locals, name ?? method.toString());
};
const patchRegex = new RegExp(String.raw`\b${patch.name}\b`);
const patchObjRegex = new RegExp(String.raw`\b${patchObj.name}\b`);
const patchRegexG = new RegExp(patchObjRegex, 'g');
const patchObjRegexG = new RegExp(patchObjRegex, 'g');
const ARGS_RX = /^\s*\w+(?:\s\w*)?\((?<args>.*?)\)|^\s*\((?<args>.*?)\)\s*=>|^\s*(?<args>\w+)\s*=>/;
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const postModuleHook = <T, A extends any[]>(name: string, module: (...deps: A) => T, hook: (mod: T, ...args: A) => any, locals: { [key: string]: any; } = {}) => {
	const args = module.toString().match(ARGS_RX)?.groups?.args ?? '';
	const hookContents = `((module, ...args) => (${hook.toString()
		.replace(patchObjRegex, `(__uclrn_${patchObj.name} = ${patchObj.toString()})`)
		.replace(patchRegex, `(__uclrn_${patch.name} = ${patch.toString()})`)
		.replaceAll(patchObjRegexG, `__uclrn_${patchObj.name}`)
		.replaceAll(patchRegexG, `__uclrn_${patch.name}`)
		.replaceAll(/new\s+Function/g, "((...args) => (__content=args.pop(),eval(`(${args.join(',')}) => {${__content}}`)))")}\
		)(module, ...args) ?? module)`;
	return patch(
		module,
		src => {
			const returnPos = src.lastIndexOf('return');
			let endIndex = src.lastIndexOf('}');
			let result: string;
			if (returnPos >= 0 && returnPos > src.lastIndexOf('}', endIndex - 1)) {
				result = src.slice(0, returnPos + 'return'.length);
				result += ` (${hookContents})((`;
				while (/[\s;]/.test(src[--endIndex]));
				result += `${src.slice(returnPos + 'return'.length, endIndex + 1)}),${args});${src.slice(endIndex + 1)}`;
			} else {
				result = `${src.slice(0, endIndex)};(${hookContents})(void 0,${args});${src.slice(endIndex)}`;
			}
			return result;
		},
		false,
		locals,
		`<module init: ${name}>`
	);
};

const courseIconsCode = courseIcons.toString();
const initCmsCode = initCms.toString();

function optimiseJs(js: string) {
	if (DEBUG) {
		console.time("optimiseJs");
		const unknownJs = js
			.replaceAll(
				/require\s*\(\s*\[\s*(["'])core_courseformat\/local\/courseindex\/(courseindex|section|cm)\1\s*\]\s*,\s*.*?\(.*?\).*?\{[^{}]*\}\s*\)/g,
				"",
			)
			.replaceAll(
				/^(\s*)if.*hascourseindexcmicons(?:.|\n)*?^\1}\s*;?/gm,
				"",
			)
			.replaceAll(/\/\/.*?$/gm, "")
			.replaceAll(/^[\s\n;]+(?:^|\Z)/gm, "");
		if (unknownJs) {
			console.warn("Excess code in courseIndex!!", unknownJs);
		}
		console.timeEnd("optimiseJs");
	}
	const result = `\
		(${courseIconsCode})();
		(${initCmsCode})();`;
	return result;
} /* (js) {
		console.time("icons");
		const iconsJs = `(${courseIconsCode.toString()})();`;
		console.timeEnd("icons");
		console.time("rest");
		const restJs = js.replaceAll(/^(\s*)if.*hascourseindexcmicons(?:.|\n)*?^\1}\s*;?/gm, "");
		console.timeEnd("rest");
		const finalDeps = [];
		let contents = "";
		let count = 0;
		console.time("requires");
		for(const match of restJs.matchAll(/^(\s*)require\((?<deps>.*?),\s*function\s*\((?<args>.*)\)\s*{(?<content>(?:.|\n)*?)^\1}\)/gm)) {
			const args = match.groups.args.split(",").map(arg => arg.trim());
			let deps = JSON.parse(match.groups.deps.replaceAll("'", '"'));
			if(typeof deps === "string") deps = [deps];
			let content = match.groups.content;
			for(let i = 0; i < Math.min(args.length, deps.length); i++) {
				let argId;
				if(finalDeps.includes(deps[i])) {
					argId = finalDeps.indexOf(deps[i]);
				} else {
					argId = finalDeps.length;
					finalDeps.push(deps[i]);
				}
				content = content.replaceAll(new RegExp(`\\b${args[i]}\\b`, "g"), `__${argId}`);
			}
			contents += content;
			if(++count > 16) {
				count = 0;
				contents += ";await new Promise(r => setTimeout(r, 0));";
			}
		}
		const requireJs = `require(${JSON.stringify(finalDeps)}, async (${finalDeps.map((el, i) => `__${i}`).join(",")}) => {${contents}});`;
		console.timeEnd("requires");
		console.time("excess");
		const excessJs = restJs
			.replaceAll(/^(\s*)require(?:.|\n)*?^\1}\s*\)\s*;?/gm, "")
			.replaceAll(/^[\s\n;]* /gm, "");
		console.timeEnd("excess");
		return `const __start = performance.now();${iconsJs}${requireJs}${excessJs
			};console.log("courseindex took", performance.now() - __start);`.replaceAll(/\s*\/\/.*$/gm, "");
	} */

// const { optimise_js } = wasm_bindgen;
// await wasm_bindgen({ module_or_path: WASM_URL });

window.__uclearn_hooks = {
	_debug_values: [],
	async templateCacheGet(courseId) {
		if (DEBUG) return {};
		const cacheStore = await uclearnDB.openStore('courseIndex');
		return await DatabaseHandler.prepare(cacheStore.get(courseId)) ?? {};
	},
	async templateCacheSet(courseId, value) {
		const cacheStore = await uclearnDB.openStore('courseIndex', 'readwrite');
		cacheStore.put({
			courseId,
			html: value.html,
			js: value.js,
		});
	},
	async optimizedRender(_templates, ...args) {
		const { html, js } = await _templates.default.renderForPromise(...args);
		return { html, js: optimiseJs(js) };
	}
};

type DefineArgs =
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	| [config: { [key: string]: any; }]
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	| [func: () => any]
	// biome-ignore lint/complexity/noBannedTypes: <explanation>
	| [deps: string[], ready: Function]
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	| [ready: (require: Require, exports: { [key: string]: any; }, module: RequireModule) => any]
	// biome-ignore lint/complexity/noBannedTypes: <explanation>
	| [name: string, deps: string[], ready: Function]
	// biome-ignore lint/complexity/noBannedTypes: <explanation>
	| [name: string, ready: Function];

export async function initPatches() {
	getRequire().then(() => {
		window.define = new Proxy(window.define, {
			apply(target, thisArg, argArray: DefineArgs) {
				if (!(typeof argArray[0] === "string"))
					return (target as (...args: DefineArgs) => void).call(
						thisArg,
						...argArray,
					);
				const name = argArray[0];
				let deps: string[];
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				let module: (...deps: any[]) => any;
				if (Array.isArray(argArray[1])) {
					deps = argArray[1];
					module = argArray[2] as typeof module;
				} else {
					deps = [];
					module = argArray[1] as typeof module;
				}
				switch (name) {
					case "core_courseformat/local/courseindex/placeholder":
						module = postModuleHook(
							name,
							module,
							(mod) => {
								patchObj(mod.prototype, "stateReady", (src) =>
									src.replaceAll(
										"this.loadStaticContent(",
										"await this.loadStaticContent(",
									),
								);
								patchObj(
									mod.prototype,
									"loadStaticContent",
									(src) =>
										`async ${src.replaceAll(
											/this.reactive.getStorageValue\(\s*(['"])courseIndex\1\s*/g,
											"await window.__uclearn_hooks.templateCacheGet(this.reactive.courseId",
										)}`,
								);
								patchObj(mod.prototype, "loadTemplateContent", (src) =>
									src
										.replaceAll(
											"_templates.default.renderForPromise(",
											"window.__uclearn_hooks.optimizedRender(_templates,",
										)
										.replaceAll(
											/this.reactive.setStorageValue\(\s*(['"])courseIndex\1\s*,/g,
											"await window.__uclearn_hooks.templateCacheSet(this.reactive.courseId,",
										),
								);
							},
						);
						break;
					case "core_courseformat/local/courseindex/cm":
					case "core_courseformat/local/courseindex/section":
					case "core_courseformat/local/courseindex/courseindex":
						module = postModuleHook(
							name,
							module,
							(mod) => {
								patchObj(mod, "init", (src) =>
									src.replaceAll(
										/document\s*\.\s*getElementById\s*\(\s*(\w+)\s*\)/g,
										"(typeof $1 !== 'string' ? $1 : document.getElementById($1))",
									),
									true,
								);
								// patchObj(
								// 	mod.prototype,
								// 	"stateReady",
								// 	src => src
								// );
							},
						);
						break;
				}
				return (target as (...args: DefineArgs) => void).call(
					thisArg,
					name,
					deps,
					module,
				);
			},
		});
	});

	hookYUI(YUI => {
		console.log('Got YUI', YUI);
		let _defaultAdd = YUI.add;
		Object.defineProperty(YUI, "add", {
			get: (): typeof YUI.add => (name, fn, version, details) => {
				const patch = patchYUIModule(name, fn, version, details);
				if (patch) {
					console.log(
						"patching",
						`${name}@${version}`,
						details,
						"transforming",
						fn,
						"->",
						patch,
					);
				}
				return _defaultAdd(name, patch ?? fn, version, details);
			},
			set(v) {
				_defaultAdd = v;
			},
		});
	});
}

const patchYUIModule: (...args: Parameters<typeof YUI.add>) => Parameters<typeof YUI.add>[1] | undefined = (name, fn, version, details) => {
	switch (name) {
		case 'event-delegate':
			if ('closest' in Element.prototype)
				return postModuleHook(name, fn, (_mod, Y) => {
					patchObj(
						// biome-ignore lint/suspicious/noExplicitAny: <explanation>
						(Y as any).delegate,
						'_applyFilter',
						src => src.replace(
							/(if\s*\(\s*i\s*\(\s*t\s*\)\s*\)(?:\s*\{)?)\s*while\s*\((\w+)\)\s*{(.*?)}/,
							(match, prefix: string, node: string, body: string) => {
								let list: string | undefined = undefined;
								for (const match of body.matchAll(/(\w+)\s*\.\s*push\s*\(\s*(\w+)\s*,?\s*\)/g)) {
									if (match[2] !== node) continue;
									list = match[1];
									break;
								}
								if (!list) {
									if (DEBUG) console.error('Could not find location of list variable in', fn);
									return match; // Fail gracefully, no optimisation
								}

								let root: string | undefined = undefined;
								for (const match of body.matchAll(/(\w+)\s*===?\s*(\w+)/g)) {
									if (match[1] !== node && match[2] !== node) continue;
									root = match[match[1] !== node ? 1 : 2];
									break;
								}
								if (!root) {
									if (DEBUG) console.error('Could not find location of root variable in', fn);
									return match; // Fail gracefully, no optimisation
								}

								const selector = src.match(/^\s*(?:function\s+)?\w+\s*\((?<args>.*?)\)\s*{|^\s*(?<args>\w+)\s*=>|^\s*\((?<args>.*?)\)\s*=>/)?.groups?.args;
								if (!selector) {
									if (DEBUG) console.error('Could not find location of selector parameter in', fn);
									return match; // Fail gracefully, no optimisation
								}

								return `${prefix}
									do {
										${node} = ${node}.closest(${selector})
									} while(${node}
									 	&& (${root}.contains(${node}) || ${root} === ${node})
										&& (${list}.push(${node}),
											${node} = ${node}.parentNode));`
									.replaceAll(/[\n\s]+/g, '');
							}),
					);
				}, { [getRemappedName(() => fn)]: fn });
			break;
		case 'selector':
			if ('matches' in Element.prototype)
				return postModuleHook(name, fn, (_mod, Y) => {
					// biome-ignore lint/suspicious/noExplicitAny: <explanation>
					(Y as any).Selector.test = (node: Element, selector: string) => node.matches(selector);
				});
			break;
	}
};
