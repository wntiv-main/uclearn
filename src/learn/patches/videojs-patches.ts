import type videojs from "video.js";
import { EXT_URL } from "../constants";
import { REQUIREJS_PATCHES } from "./requirejs-patches";
import { storeDefaultPlaybackRate } from "../config";

export const VJS_WRAPPER_CLASS = 'uclearn-video-wrapper';

let _vjs: typeof videojs | null = null;
let _playbackRate = 1.0;
export function setDefaultPlaybackRate(rate: number) {
	_playbackRate = rate;
	for (const player of _vjs?.getAllPlayers() ?? []) {
		if (player.playbackRate() === rate) continue; // avoid infinite loop
		player.defaultPlaybackRate(rate);
		player.resetPlaybackRate_();
	}
}

REQUIREJS_PATCHES['media_videojs/video-lazy'] = (ready) => {
	// biome-ignore lint/suspicious/noAssignInExpressions: no
	return (...args) => new Proxy(_vjs = ready(...args), {
		apply(target, thisArg, [id, options, ready]: Parameters<typeof videojs>) {
			let player = target.getPlayer(id);
			if (!player) {
				const el = typeof id === "string" ? document.getElementById(id) : id;
				if (!el) throw new Error(`Could not find element '${id}'`);
				const wrapper = document.createElement("div");
				el.after(wrapper);
				wrapper.classList.add(VJS_WRAPPER_CLASS);
				const root = wrapper.attachShadow({ mode: "open" });
				const styles = document.createElement("link");
				styles.rel = "stylesheet";
				styles.href = `${EXT_URL}/learn/videojs-shadow.css`;
				styles.id = "__uclearn-videojs-shadow-css";
				root.append(styles, el);
				player = Reflect.apply(target, thisArg, [el, options, ready]);
				player.playbackRates([0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0]);
				player.defaultPlaybackRate(_playbackRate);
				player.on('ready', () => {
					player?.resetPlaybackRate_();
				});
				player.on('ratechange', () => {
					const newRate = player?.playbackRate();
					if (newRate) storeDefaultPlaybackRate(newRate);
				});
			}
			return player;
		},
	});
};
