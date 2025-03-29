import type { Ace } from "ace-code";

export type AceGapfillerUi = object;
export type AceGapfillerUiCtor = { new(): AceGapfillerUi, prototype: AceGapfillerUi; };

type GapPos = {
	row: number;
	column: number;
};
export type Gap = {
	readonly minWidth: number;
	textSize: number;
	range: Ace.Range;
	cursorInGap(cursor: GapPos): boolean;
	getWidth(): number;
	changeWidth(gaps: Gap[], delta: number): void;
	insertChar(gaps: Gap[], pos: GapPos, char: string): void;
	deleteChar(gaps: Gap[], pos: GapPos): void;
	deleteRange(gaps: Gap[], start: number, end: number): void;
	insertText(gaps: Gap[], start: number, text: string): void;
	getText(): string;
};
export type GapCtor = { new(editor: Ace.Editor, row: number, column: number, minWidth: number, maxWidth?: number): Gap, prototype: Gap; };
