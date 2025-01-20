
async function loadScript(script: HTMLScriptElement) {
	console.log("loading", script);
	if (script.src) {
		try {
			return `${await (await fetch(script.src, {
				priority: script.getAttribute("priority") as RequestPriority ?? undefined,
			})).text()}//# sourceURL=${script.src}`;
		} catch (e) {
			console.warn(e);
			return '';
		}
	}
	return script.text;
}

function execScript(script: HTMLScriptElement, content: string) {
	if (!content) return;
	const newScript = document.createElement("script");
	for (const attr of script.attributes) {
		if (attr.name === 'src' || attr.name === 'async' || attr.name === 'defer') continue;
		newScript.setAttribute(attr.name, attr.value);
	}
	newScript.text = content;
	script.replaceWith(newScript);
}

type ScriptAndContent = readonly [HTMLScriptElement, Promise<string>];
export async function loadPage() {
	const scripts: ScriptAndContent[] = [];
	const asyncScripts: ScriptAndContent[] = [];
	const deferScripts: ScriptAndContent[] = [];

	for (const script of document.scripts) {
		if (script.id === "__uclearn_bootload_script_el") continue;
		if (
			(script.type && !/j(ava)?s(cript)?/i.test(script.type)) ||
			(script.hasAttribute("language") &&
				!/j(ava)?s(cript)?/i.test(script.getAttribute("language") ?? ""))
		)
			continue;
		const loadingScript = [script, loadScript(script)] satisfies ScriptAndContent;
		if (script.async) asyncScripts.push(loadingScript);
		else if (script.defer) deferScripts.push(loadingScript);
		else scripts.push(loadingScript);
	}

	for (const [script, content] of scripts) {
		execScript(script, await content);
	}
	const runningAsyncScripts = Promise.all(asyncScripts.map(async ([script, content]) => {
		return execScript(script, await content);
	}));
	for (const [script, content] of deferScripts) {
		execScript(script, await content);
	}
	await runningAsyncScripts;
	return;
}
