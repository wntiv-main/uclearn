export function initKeybindings() {
	document.addEventListener("keydown", e => {
		const el = e.target as Element;
		if (e.key?.startsWith('Arrow')) {
			const sstField = el.closest<HTMLInputElement>('.sst input, .stack table input');
			if (sstField) {
				// biome-ignore lint/style/noNonNullAssertion: must be present
				const sst = sstField.closest('.sst, .stack table')!;
				if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					e.preventDefault();
					const cell = sstField.closest('td, th');
					const rows = [...sst.querySelectorAll("tr")];
					const nextRow = rows.at(
						(rows.indexOf(cell?.parentElement as HTMLTableRowElement)
							+ (e.key === 'ArrowUp' ? -1 : 1)) % rows.length);
					nextRow?.children[([] as typeof cell[]).indexOf.call(cell?.parentElement?.children, cell)]?.querySelector('input')?.focus();
				} else if (sstField.selectionStart != null && sstField.selectionStart === sstField.selectionEnd) {
					const fullTable = sst.classList.contains('matrixtable') ? sst.parentElement?.closest('.stack table') ?? sst : sst;
					if (fullTable !== sst) {
						const outerRow = sst.closest('tr');
						const innerRow = sstField.closest('tr');
						const rowIdx = Array.prototype.indexOf.call(outerRow?.parentElement?.children ?? [], outerRow)
							+ Array.prototype.indexOf.call(innerRow?.parentElement?.children ?? [], innerRow);

						const outerCell = sst.closest('td');
						const innerCell = sstField.closest('td');
						const colIdx = Array.prototype.indexOf.call(outerRow?.children ?? [], outerCell)
							+ Array.prototype.indexOf.call(innerRow?.children ?? [], innerCell);
					}
					const fields = [...fullTable.querySelectorAll("input")];
					if (e.key === 'ArrowLeft' && sstField.selectionStart <= 0) {
						e.preventDefault();
						fields.at(fields.indexOf(sstField) - 1)?.focus();
					} else if (e.key === "ArrowRight" && sstField.selectionStart >= sstField.value.length) {
						e.preventDefault();
						fields.at((fields.indexOf(sstField) + 1) % fields.length)?.focus();
					}
				}
			}
		}
	});
}
