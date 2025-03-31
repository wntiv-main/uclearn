import Watcher from 'watcher';

const WATCHER_GROUP = 'file-watcher';

const server = Bun.serve({
	port: 4360,
	fetch(req, server) {
		// upgrade the request to a WebSocket
		if (server.upgrade(req)) {
			return; // do not return a Response
		}
		return new Response("Upgrade failed", { status: 500 });
	},
	websocket: {
		message() { },
		open(ws) { ws.subscribe(WATCHER_GROUP); },
		close(ws) { ws.unsubscribe(WATCHER_GROUP); },
	},
});
setInterval(() => server.publish(WATCHER_GROUP, 'keep-alive'), 10e3);

const watcher = new Watcher();
watcher.watch('./src/static', {
	recursive: true,
	ignore: /_metadata|logos|pyright|font|python-typeshed\.zip/,
	ignoreInitial: true,
}, (evt, path) => {
	console.log(evt, path);
	if (path.endsWith('.css'))
		server.publish(WATCHER_GROUP, 'css-reload');
	else if (path.endsWith('.json')
		|| path.endsWith('dev-watcher-client.js'))
		server.publish(WATCHER_GROUP, 'manifest-reload');
	else
		server.publish(WATCHER_GROUP, 'full-reload');
});

export { };
