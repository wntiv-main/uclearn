// stop();
const parser = new DOMParser();
/** @type HTMLElement | null */
let _transformDiv = null;
/**
 * @param {string} content The page content to transform
 * @returns The transformed content
 */
function contentTransformer(content) {
	return content.replace(/value\s*=\s*"([^"\n]*?;"__uclearn-mltex-\(";".*?";"__uclearn-mltex-\)".*?)"/g, (_match, data) => {
		_transformDiv ??= document.createElement('div');
		_transformDiv.setAttribute('data-uclearn-value', data);
		return `value=${_transformDiv.outerHTML.match(/<[dD][iI][vV].*?data-uclearn-value=(".*").*?>/)?.[1]}`;
	});
}
(async () => {
	if(!document.contentType.includes("html")) return;
	const request = fetch(location.href, {
		method: 'GET',
		priority: 'high',
		cache: 'force-cache',
	});
	document.open();
	document.writeln("<!doctype html>");
	document.close();
	const response = await request;
	const content = contentTransformer(await response.text());

	const contentType = response.headers.get("Content-Type")?.split(";")[0] ?? 'text/html';
	const dom = parser.parseFromString(content, contentType);
	const oldEls = [...document.documentElement.children].filter((el) => !/^(head|body)$/i.test(el.tagName));
	document.documentElement.replaceWith(document.adoptNode(dom.documentElement));

	const root = document.documentElement;
	root.prepend(...oldEls);

	const script = document.createElement("script");
	script.id = "__uclearn_bootload_script_el";
	script.classList.add('__uclearn-skip-reload', '__uclearn-hydrate-remove');
	script.src = chrome.runtime.getURL("learn/index.js");
	script.type = "module";
	root.prepend(script);
})();
