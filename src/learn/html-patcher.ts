let _transformDiv: HTMLElement | null = null;

export function contentTransformer(content: string) {
	return content.replace(/value\s*=\s*"([^"\n]*?;"__uclearn-mltex-\(";".*?";"__uclearn-mltex-\)".*?)"/g, (_match, data) => {
		_transformDiv ??= document.createElement('div');
		_transformDiv.setAttribute('data-uclearn-value', data);
		return `value=${_transformDiv.outerHTML.match(/<[dD][iI][vV].*?data-uclearn-value=(".*").*?>/)?.[1]}`;
	});
}
