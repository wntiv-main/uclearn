export class LazyPromise<T> extends Promise<T> {
	#neededCb: (() => void) | undefined;
	constructor (task: (needed: Promise<void>, res: (value: T) => void, rej: (err: unknown) => void) => unknown) {
		const needed = new Promise<void>(res => { this.#neededCb = res; });
		super((res, rej) => task(needed, res, rej));
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
		return new LazyPromise<R>(async (needed, res, rej) => {
			await needed;
			coro(...args).then(res, rej);
		});
	}
}
