export class LazyPromise<T> extends Promise<T> {
	#neededCb: (() => void) | undefined;
	// `needed` arg *MUST* be last: https://gist.github.com/domenic/8ed6048b187ee8f2ec75
	constructor (task: (res: (value: T) => void, rej: (err: unknown) => void, needed: Promise<void>) => unknown) {
		let neededCb: (() => void) | undefined = undefined;
		const needed = new Promise<void>(res => { neededCb = res; });
		super((res, rej) => task(res, rej, needed));
		this.#neededCb = neededCb;
	}

	// biome-ignore lint/suspicious/noThenProperty: its a Promise subclass tho???
	then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined) {
		this.#neededCb?.();
		return super.then(onfulfilled, onrejected);
	}

	catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null | undefined) {
		this.#neededCb?.();
		return super.catch(onrejected);
	}

	finally(onfinally?: (() => void) | null | undefined) {
		this.#neededCb?.();
		return super.finally(onfinally);
	}

	static wrap<A extends unknown[], R>(coro: (...args: A) => Promise<R>, ...args: A) {
		return new LazyPromise<R>(async (res, rej, needed) => {
			await needed;
			coro(...args).then(res, rej);
		});
	}
}
