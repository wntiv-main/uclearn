import type MathQuillLoader from 'mathquill'
import type { MathQuill, MathField } from 'mathquill'
import { AMTparseAMtoTeX } from 'asciimath'

const extURL = new URL((document.getElementById("__uclearn_bootload_script_el") as HTMLScriptElement).src).origin;

let MQ: MathQuill | null = null;

export function initField(input: HTMLInputElement) {
	if(!MQ) throw new Error("MathQuill not ready yet!");
	const fieldContainer = document.createElement("span");
	fieldContainer.classList.add("uclearn-mathquillField");
	input.insertAdjacentElement('beforebegin', fieldContainer);
	let skipUpdate = false;
	const field = MQ.MathField(fieldContainer, {
		spaceBehavesLikeTab: true,
		autoCommands: 'pi theta sqrt sum int',
		handlers: {
			enter(math: MathField) {
				// this.edit(field);
				// Find next field
				const el = math.el().querySelector(":scope .mq-textarea textarea");
				if(!(el instanceof HTMLTextAreaElement)) return;
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				const fields = [...el.form!.elements];
				const nextFields = fields.slice(fields.indexOf(el) + 1) as (HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement)[];
				for(const field of nextFields) {
					if(field.getAttribute("name") === "previous") continue;
					if(!field.checkVisibility()) continue;
					field.focus();
					if((field.tagName === "INPUT" || field.tagName === "BUTTON")
						&& field.getAttribute("type")?.toLowerCase().trim() === "submit") {
						field.click();
					}
					break;
				}
			},
			edit(field) {
				if(skipUpdate) {
					skipUpdate = false;
					return;
				}
				const latex = field.latex();
				if(typeof latex !== 'string') return;
				const latexExps = latex.matchAll(/\^(?!\{?\()/g);
				let text = field.text()
					// excess *
					.replaceAll(/([,])\*/g, '$1')
					// sin(), cos(), etc...
					.replaceAll(/\\((?:\w\*)*\w)(?:\s*\*)?/g, (_, g1) => g1.replaceAll('*', ''))
					// Constant multiplier of bracketed group
					.replaceAll(/(\w(?<!sinh?|cosh?|tanh?|exp|sqrt|[oc]{2}|ln|log)|\))(\(|(?<=\d)[a-zA-Z\\]|(?<=\))\w)/g, "$1*$2")
					// .replaceAll(/(?<=\w|\))(?<!sinh?|cosh?|tanh?|exp|sqrt)(\(|pi|theta)|(?<=\)|\d)(\w)/g, '*$1')
					// factorial
					.replaceAll(/\*!/g, '!');
				let lm: IteratorResult<RegExpExecArray, undefined>;
				let tm = 0;
				let dtm: number;
				// biome-ignore lint/suspicious/noAssignInExpressions: >.<
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				while(!(lm = latexExps.next()).done && (dtm = text.slice(tm + 1).search(/\^(?!\()/g)) != null) {
					tm += dtm + 1;
					let ti = 1;
					let li = 1;
					let depth = 0;
					while(depth > 0 || !(li - 1)) {
						if(latex[li + lm.value.index] === '{') {
							depth++;
							li++;
						} else if(latex[li + lm.value.index] === '}') {
							depth--;
							li++;
						} else if(text[ti + tm] === '*') {
							ti++;
						} else if(latex[li + lm.value.index] === text[ti + tm]) {
							ti++;
							li++;
						} else {
							li++;
						}
					}
					if(li > 2)
						text = `${text.substring(0, tm + 1)}(${text.substring(tm + 1, tm + ti)})${text.substring(tm + ti)}`;
				}
				input.value = text;
				input.dispatchEvent(new InputEvent("input"));
			}
		}
	});
	if(input.value) {
		const value = AMTparseAMtoTeX(input.value)
			.replaceAll("\\cdot", "")
			.replaceAll("\\in{f}", "\\inf");
		console.log(value);
		skipUpdate = true;
		field.latex(value);
	}
}

function onJQueryReady() {
	console.log("jQuery ready");
	const mathquillScript = document.createElement("script");
	mathquillScript.src = `${extURL}/mathquill/mathquill.min.js`;
	mathquillScript.addEventListener("load", () => {
		console.log("MathQuill ready");
		MQ = (window as typeof window & { MathQuill: typeof MathQuillLoader }).MathQuill.getInterface(2);
		for(const input of document.querySelectorAll(".que.stack input:is(.algebraic, .numerical), .que.stack .matrixtable input")) {
			if(input.closest('[hidden]')) continue;
			initField(input as HTMLInputElement);
		}
	});
	document.body.append(mathquillScript);
}
export function initMathQuill() {
	if (!("jQuery" in window)) {
		let jQueryValue: unknown = undefined;
		Object.defineProperty(window, "jQuery", {
			get() {
				return jQueryValue;
			},
			set(v) {
				const isFirst = !jQueryValue;
				jQueryValue = v;
				if (isFirst) onJQueryReady();
			},
		});
	} else {
		onJQueryReady();
	}
}
