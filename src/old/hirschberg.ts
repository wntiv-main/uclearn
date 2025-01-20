const COST = 1;
const SCOST = 1;
function NeedlemanWunsch<T, U>(A: T[], B: U[], eq: (a: T, b: U) => boolean | number): [(T | null)[], (U | null)[]] {
	const F = [];
	for(let i = 0; i < B.length + 1; i++) {
		F.push(new Array(A.length + 1));
	}
	for(let i = 0; i < A.length + 1; i++) {
		F[0][i] = COST * i;
	}
	for(let j = 0; j < B.length + 1; j++) {
		F[j][0] = COST * j;
	}
	for(let i = 0; i < A.length; i++) {
		for(let j = 0; j < B.length; j++) {
			const Match = F[j][i] + SCOST * (1 - (eq(A[i], B[j]) as number));
			const Delete = F[j + 1][i] + COST;
			const Insert = F[j][i + 1] + COST;
			F[j + 1][i + 1] = Math.min(Match, Insert, Delete);
		}
	}
	const AlignmentA = [];
	const AlignmentB = [];
	let i = A.length;
	let j = B.length;
	while(i > 0 || j > 0) {
		if(
			i > 0 &&
			j > 0 &&
			F[j][i] ===
			F[j - 1][i - 1] + SCOST * (1 - (eq(A[i - 1], B[j - 1]) as number))
		) {
			AlignmentA.push(A[i - 1]);
			AlignmentB.push(B[j - 1]);
			i -= 1;
			j -= 1;
		} else if(i > 0 && F[j][i] === F[j][i - 1] + COST) {
			AlignmentA.push(A[i - 1]);
			AlignmentB.push(null);
			i -= 1;
		} else {
			AlignmentA.push(null);
			AlignmentB.push(B[j - 1]);
			j -= 1;
		}
	}
	return [AlignmentA.reverse(), AlignmentB.reverse()];
}

function* range(start: number, end?: number, step = 1) {
	let min = start;
	let max: number;
	if(end === undefined) {
		min = 0;
		max = start;
	} else max = end;
	for(let i = min; step > 0 ? i < max : i > max; i += step) {
		yield i;
	}
}

function NWScore<T, U>(X: T[], Y: U[], eq: (a: T, b: U) => boolean | number) {
	const Score0 = [...range(Y.length + 1)];
	let upleft: number;
	for (const Xi of X) {
		upleft = Score0[0];
		Score0[0] = Score0[0] + COST; // Del(Xi)
		for(let j = 0; j < Y.length; j++) {
			const scoreSub = upleft + ((1 - (eq(Xi, Y[j]) as number)) * SCOST); // Sub(Xi, Yj)
			const scoreDel = Score0[j + 1] + COST; // Del(Xi);
			const scoreIns = Score0[j] + COST; // Ins(Yj);
			upleft = Score0[j + 1];
			Score0[j + 1] = Math.min(scoreSub, scoreDel, scoreIns);
		}
	}
	return Score0;
}

export const LevenshteinDistance = (...args: Parameters<typeof NWScore>) => NWScore(...args).pop() ?? 0;

// https://en.wikipedia.org/wiki/Hirschberg%27s_algorithm
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export function Hirschberg<T, U>(X: T[], Y: U[], _equal = (a: T, b: U): boolean | number => (a as any) === (b as any)): [(T | null)[], (U | null)[]] {
	let Z: (T | null)[] = [];
	let W: (U | null)[] = [];
	if(X.length === 0) {
		for(const Yi of Y) {
			Z.push(null);
			W.push(Yi);
		}
	} else if(Y.length === 0) {
		for(const Xi of X) {
			Z.push(Xi);
			W.push(null);
		}
	} else if(X.length === 1 || Y.length === 1) {
		const [z, w] = NeedlemanWunsch(X, Y, _equal);
		Z = z;
		W = w;
	} else {
		const xmid = Math.floor(X.length / 2);
		const ScoreL = NWScore(X.slice(0, xmid), Y, _equal);
		const ScoreR = NWScore(
			X.slice(xmid).reverse(),
			[...Y].reverse(),
			_equal,
		).reverse();
		let ymid = 0;
		let ymid_val = Number.MAX_VALUE;
		for(let i = 0; i < Math.min(ScoreL.length, ScoreR.length); i++) {
			if(ScoreL[i] + ScoreR[i] < ymid_val) {
				ymid_val = ScoreL[i] + ScoreR[i];
				ymid = i;
			}
		}
		const [left_z, left_w] = Hirschberg(
			X.slice(0, xmid),
			Y.slice(0, ymid),
			_equal
		);
		const [right_z, right_w] = Hirschberg(X.slice(xmid), Y.slice(ymid), _equal);
		Z = left_z.concat(right_z);
		W = left_w.concat(right_w);
	}
	return [Z, W];
}
