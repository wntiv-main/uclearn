// stop();
const parser = new DOMParser();
(async () => {
	if(!document.contentType.includes("html")) return;
	document.open();
	document.writeln("<!doctype html>");
	document.close();
	const response = await fetch(location.href, {
		method: 'GET',
		priority: 'high',
		cache: 'force-cache',
	});
	const content = await response.text();
	const contentType = response.headers.get("Content-Type")?.split(";")[0] ?? 'text/html';
	const dom = parser.parseFromString(content, contentType);
	document.documentElement.replaceWith(document.adoptNode(dom.documentElement));

	const root = document.documentElement;

	// root.style.setProperty("--uclearn-bg-url",
	// 	`url("${chrome.runtime.getURL("background.png")}")`);

	// root.classList.add("uclearn-dark-mode");

	// window.addEventListener("load", () => {
	// 	for(const el of document.querySelectorAll(".navbar-light")) {
	// 		el.classList.remove("navbar-light");
	// 	}
	// });

	const script = document.createElement("script");
	script.id = "__uclearn_bootload_script_el";
	script.classList.add('__uclearn-skip-reload');
	script.src = chrome.runtime.getURL("index.js");
	script.type = "module";
	root.prepend(script);
})();
