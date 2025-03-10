import type Chrome from './chrome';
declare const chrome: typeof Chrome;

import { contentTransformer } from './html-patcher';

const parser = new DOMParser();

(async () => {
	if (!document.contentType.includes("html")) return;
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
	const dom = parser.parseFromString(content, contentType as DOMParserSupportedType);
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
