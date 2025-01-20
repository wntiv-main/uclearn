export const courseIcons = () => {
	// Boost Union JS to change the completion indication if enabled.
	if(document.body.classList.contains('hascourseindexcmicons')) {
		// Completion indication should be encoded in cm icon.
		if(document.body.classList.contains('hascourseindexcplicon')) {
			// courseindex-cmicon-cpl-sol
			// courseindex-cmicon-cpl-icon
			// courseindex-cmicon-cpl-eol

			// Completion indication not shown at start of line anymore.
			for(const el of document.querySelectorAll('.courseindex-item span.completioninfo.courseindex-cmicon-cpl-sol') as Iterable<HTMLElement>) {
				el.dataset.for = '_';
			}

			// The completion indication within the icon is now the active one.
			for(const el of document.querySelectorAll('.courseindex-item span.completioninfo.courseindex-cmicon-cpl-icon') as Iterable<HTMLElement>) {
				el.dataset.for = 'cm_completion';
			}

			// Changes to this completion indication will be observed.
			const observer = new MutationObserver((mutations) => {
				for(const mutation of mutations) {
					const target = mutation.target;
					if(!(target instanceof HTMLElement) || target.closest('[id^="courseindex-cmicon-observ-"]')) continue;
					const node = target.childNodes[3] as HTMLElement;
					if(node.id.startsWith('courseindex-cmicon-cplid-')) {
						const cplel = document.getElementById(node.id) as HTMLElement;
						// Set the completion color for the icon based on the completion status.
						switch(node.dataset.value) {
							case 'NaN':
								break;
							case '0':
								cplel.closest('.courseindex-cmicon-container')?.classList.add('courseindex-cmicon-cpl-incomplete');
								break;
							case '1':
								cplel.closest('.courseindex-cmicon-container')?.classList.add('courseindex-cmicon-cpl-complete');
								break;
							case '3':
								cplel.closest('.courseindex-cmicon-container')?.classList.add('courseindex-cmicon-cpl-fail');
								break;
						}
					}
				};
			});
			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			observer.observe(document.getElementById('courseindex')!, { attributes: true, childList: true });

			// Or completion indication should be shown at the end of the line.
		} else if(document.body.classList.contains('hascourseindexcpleol')) {
			// Completion indication not shown at start of line anymore.
			for(const el of document.querySelectorAll('.courseindex-item span.completioninfo.courseindex-cmicon-cpl-sol') as Iterable<HTMLElement>) {
				el.dataset.for = '_';
			}

			// The completion indication at the end of the line is now the active one.
			for(const el of document.querySelectorAll('.courseindex-item span.completioninfo.courseindex-cmicon-cpl-eol') as Iterable<HTMLElement>) {
				el.dataset.for = 'cm_completion';
			}
		}
	}
};

export const initCms = () => {
	window.require(
		[
			"core_courseformat/local/courseindex/cm",
			"core_courseformat/local/courseindex/section",
			"core_courseformat/local/courseindex/courseindex",
		],
		(
			_cm: { init: (el: string | HTMLElement) => void; },
			_section: { init: (el: string | HTMLElement) => void; },
			_index: { init: (el: string | HTMLElement) => void; },
		) => {
			console.time('reactiveInitCourseIndex');
			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			const index = document.getElementById("course-index")!;
			for(const section of index.children) {
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				const sectionContent = section.querySelector(":scope .courseindex-sectioncontent")!;
				for(const cm of sectionContent.children) {
					_cm.init(cm as HTMLElement);
				}
				_section.init(section as HTMLElement);
			}
			_index.init(index);
			console.timeEnd('reactiveInitCourseIndex');
		});
};
