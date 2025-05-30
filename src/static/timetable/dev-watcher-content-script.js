(() => {
	const CSS_ID = '__uclearn-css-inject';
	const CSS_RELOAD_CLASS = '__uclearn-refresh-css';
	const linkEl = document.getElementById(CSS_ID);
	if(!linkEl) {
		const css = document.createElement("link");
		css.id = CSS_ID;
		css.rel = "stylesheet";
		css.href = chrome.runtime.getURL('timetable/index.css');
		document.documentElement.prepend(css);
	} else if(linkEl.classList.contains(CSS_RELOAD_CLASS)) {
		linkEl.classList.remove(CSS_RELOAD_CLASS);
		// biome-ignore lint/correctness/noSelfAssign: forces reload
		linkEl.href = linkEl.href;
	}
})();
