// modified from: https://stackoverflow.com/a/30810322
function fallbackCopyTextToClipboard(text: string) {
	const textArea = document.createElement("textarea");
	textArea.value = text;

	// Avoid scrolling to bottom
	textArea.style.opacity = '0';
	textArea.style.position = "fixed";
	textArea.style.top = "0";
	textArea.style.left = "0";

	document.body.appendChild(textArea);
	textArea.focus();
	textArea.select();

	try {
		if (!document.execCommand('copy'))
			console.error('Unable to copy', text);
	} catch (err) {
		console.error('Unable to copy', text, err);
	}

	document.body.removeChild(textArea);
}

export function copyTextToClipboard(text: string) {
	if (!navigator.clipboard) {
		fallbackCopyTextToClipboard(text);
		return;
	}
	navigator.clipboard.writeText(text).catch(err => {
		console.error('Unable to copy', text, err);
	});
}
