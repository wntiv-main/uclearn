import { DEBUG, DEBUG_SCRIPTING } from "../global/constants";
import { asyncTimeout } from "../global/util";
import { Toast } from "./lib-hook";

type Transcriber = (script: string) => string | null;
export const SKIP_SCRIPT_CLASS = '__uclearn-skip-reload';

export async function loadScript(script: HTMLScriptElement | string, transcriber?: Transcriber) {
	if (typeof script === 'string' || script.src) {
		const src = typeof script === 'string' ? script : script.src;
		try {
			const content = await (await fetch(src, {
				priority: typeof script === 'string' ? undefined
					: script.getAttribute("priority") as RequestPriority | null ?? undefined,
			})).text();
			const result = `document.currentScript.setAttribute("src", ${JSON.stringify(src)});\
				${content}//# sourceURL=${src}`;
			return transcriber?.(result) ?? result;
		} catch (e) {
			console.warn(e);
			return transcriber?.('') ?? '';
		}
	}
	return transcriber?.(script.text) ?? script.text;
}

export async function execScript(script: HTMLScriptElement | null, content: string) {
	const newScript = document.createElement("script");
	for (const attr of script?.attributes ?? []) {
		if ((attr.name === 'src' && content) || attr.name === 'async' || attr.name === 'defer') continue;
		newScript.setAttribute(attr.name, attr.value);
	}
	if (DEBUG) newScript.addEventListener("error", async (e) => {
		console.warn("Script failed to run:", e, newScript);
		(await Toast).add('Script failed to run during hydration!', { type: 'danger' });
	});
	if (DEBUG_SCRIPTING) {
		const scriptStartTime = performance.now();
		if (content) {
			newScript.text = content;
			if (script) script.replaceWith(newScript);
			else document.head.append(newScript);
			await asyncTimeout(0);
			console.log('Executed script', newScript, 'in', performance.now() - scriptStartTime, 'ms');
		} else {
			return new Promise<void>(res => {
				newScript.addEventListener('load', () => res());
				if (script) script.replaceWith(newScript);
				else document.head.append(newScript);
			}).then(() =>
				console.log('Executed script', newScript, 'in', performance.now() - scriptStartTime, 'ms'));
		}
	} else {
		if (content) {
			newScript.text = content;
			if (script) script.replaceWith(newScript);
			else document.head.append(newScript);
		} else {
			return new Promise<void>(res => {
				newScript.addEventListener('load', () => res());
				if (script) script.replaceWith(newScript);
				else document.head.append(newScript);
			});
		}
	}
}

type ScriptAndContent = readonly [HTMLScriptElement, Promise<string>];
export async function loadScripts(scripts: Iterable<HTMLScriptElement>, transcriber?: Transcriber) {
	const inlineScripts: ScriptAndContent[] = [];
	const asyncScripts: ScriptAndContent[] = [];
	const deferScripts: ScriptAndContent[] = [];

	for (const script of scripts) {
		if (
			(script.type && !/j(ava)?s(cript)?/i.test(script.type)) ||
			(script.hasAttribute("language") &&
				!/j(ava)?s(cript)?/i.test(script.getAttribute("language") ?? ""))
		)
			continue;
		const loadingScript = [script, loadScript(script, transcriber)] satisfies ScriptAndContent;
		if (script.async) asyncScripts.push(loadingScript);
		else if (script.defer) deferScripts.push(loadingScript);
		else inlineScripts.push(loadingScript);
	}

	for (const [script, content] of inlineScripts) {
		await execScript(script, await content);
	}
	const runningAsyncScripts = Promise.all(asyncScripts.map(async ([script, content]) => {
		return execScript(script, await content);
	}));
	for (const [script, content] of deferScripts) {
		await execScript(script, await content);
	}
	await runningAsyncScripts;
}
