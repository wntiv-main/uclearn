import { initPatches } from "./patches";
import { initVideos } from "./video";
import { initHydration } from "./hydration";
import { initMathQuill } from "./mathquill-loader";

initPatches();

const scripts = [];
const asyncScripts = [];
const deferScripts = [];

for (const script of document.scripts) {
	if (script.id === "__uclearn_bootload_script_el") continue;
	if (
		(script.type && !/j(ava)?s(cript)?/i.test(script.type)) ||
		(script.hasAttribute("language") &&
			!/j(ava)?s(cript)?/i.test(script.getAttribute("language") ?? ""))
	)
		continue;
	if (script.async) asyncScripts.push(script);
	else if (script.defer) deferScripts.push(script);
	else scripts.push(script);
}
(async () => {})();

initVideos();
initHydration();
initMathQuill();
