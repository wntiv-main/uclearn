
async function loadScript(script: HTMLScriptElement) {
	if (script.src) {
		try {
			const content = await (await fetch(script.src, {
				priority: script.getAttribute("priority") as RequestPriority ?? undefined,
			})).text();
			return `document.currentScript.setAttribute("src", ${JSON.stringify(script.src)});\
				${content}//# sourceURL=${script.src}`;
		} catch (e) {
			console.warn(e);
			return '';
		}
	}
	return script.text;
}

async function execScript(script: HTMLScriptElement, content: string) {
	const newScript = document.createElement("script");
	for (const attr of script.attributes) {
		if ((attr.name === 'src' && content) || attr.name === 'async' || attr.name === 'defer') continue;
		newScript.setAttribute(attr.name, attr.value);
	}
	if (content) {
		newScript.text = content;
		script.replaceWith(newScript);
	} else {
		return new Promise<void>(res => {
			newScript.addEventListener('load', () => res());
			script.replaceWith(newScript);
		});
	}
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
		await execScript(script, await content);
	}
	const runningAsyncScripts = Promise.all(asyncScripts.map(async ([script, content]) => {
		return execScript(script, await content);
	}));
	for (const [script, content] of deferScripts) {
		await execScript(script, await content);
	}
	await runningAsyncScripts;
	return;
}
