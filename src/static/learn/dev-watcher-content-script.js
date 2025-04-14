(() => {
	const CSS_ID = '__uclearn-css-inject';
	const CSS_RELOAD_CLASS = '__uclearn-refresh-css';
	const linkEl = document.getElementById(CSS_ID);
	if(!linkEl) {
		const css = document.createElement("link");
		css.id = CSS_ID;
		css.classList.add('__uclearn-skip-reload', '__uclearn-hydrate-remove');
		css.rel = "stylesheet";
		css.href = chrome.runtime.getURL('learn/index.css');
		document.documentElement.prepend(css);
	} else if(linkEl.classList.contains(CSS_RELOAD_CLASS)) {
		linkEl.classList.remove(CSS_RELOAD_CLASS);
		/* eslint-disable-next-line no-self-assign
		*/// biome-ignore lint/correctness/noSelfAssign: forces reload
		linkEl.href = linkEl.href;
		for(const el of document.getElementsByClassName('__uclearn-code-editor-container')) {
			const shadowLink = el.shadowRoot.getElementById('__uclearn-ace-code-shadow');
			if(!shadowLink) continue;
			/* eslint-disable-next-line no-self-assign
			*/// biome-ignore lint/correctness/noSelfAssign: forces reload
			shadowLink.href = shadowLink.href;
		}
		for(const el of document.getElementsByClassName('uclearn-video-wrapper')) {
			const shadowLink = el.shadowRoot.getElementById('__uclearn-videojs-shadow-css');
			if(!shadowLink) continue;
			/* eslint-disable-next-line no-self-assign
			*/// biome-ignore lint/correctness/noSelfAssign: forces reload
			shadowLink.href = shadowLink.href;
		}
	}
})();
