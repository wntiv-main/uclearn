import type { Connection, Scheduler, TimetableEvent, TimetableNode } from "./timetable";

declare const min_start: Date;
declare const max_end: Date;

function eventContent(event: TimetableEvent, showMismatch?: boolean) {
	const connections = Object.entries(connectionsCache).flatMap(([id, connection]) => {
		if (`${event.subject_code}||${event.activity_group_code}||${event.activity_code}` in connection.allocated)
			return `<div class="__uclearn-user-profile" title="${connection.first_name} ${connection.last_name}">\
				${connection.first_name[0]}${connection.last_name[0]}
			\</div>`;
		if (showMismatch)
			for (const key of Object.keys(connection.allocated)) if (key.startsWith(`${event.subject_code}||${event.activity_group_code}||`))
				return `<div class="__uclearn-user-profile __uclearn-mismatch" title="${connection.first_name} ${connection.last_name}">\
					${connection.first_name[0]}${connection.last_name[0]}
				\</div>`;
		return [];
	});
	const location = event.location.length > 20 ? `${event.location.slice(0, 17)}...` : event.location;
	return `${event.displaySubjectCode} - ${event.activity_group_code} [${event.activity_code}]<br>${location}\
			<div class="__uclearn-profile-set">${connections.join('')}</div>`;
}

function updateEvent(evt: TimetableNode) {
	evt.text = eventContent(evt.node, !(evt.css_class?.includes(ALTERNATIVE_CLASS)));
	window.timetable.event_updated(evt);
	if (!window.timetable._loading)
		window.timetable.callEvent("onEventChanged", [evt.id, evt]);
}

const connectionsCache: Record<string, Connection & Pick<typeof window.data.student, 'allocated' | 'external_activities'>> = {};
let _scheduler: Scheduler;
const WEEK_DURATION = 7 * 24 * 60 * 60 * 1000;
Object.defineProperty(window, 'timetable', {
	get: () => _scheduler,
	set(v) {
		_scheduler = v;
		const _render = _scheduler._render_v_bar;
		_scheduler._render_v_bar = function (this: Scheduler, eventId, ...args) {
			const result = _render.call(this, eventId, ...args);
			const timeline = document.createElement("div");
			timeline.classList.add('__uclearn-timeline');
			const event = this.getEvent(eventId);
			const [d, m, y] = event.node.start_date.split("/").map(x => Number.parseInt(x));
			const startOffset = typeof min_start === 'undefined' ? 0
				: Math.floor((min_start.getTime() - new Date(y, m - 1, d).getTime()) / WEEK_DURATION);
			const endOffset = typeof min_start === 'undefined' || typeof max_end === 'undefined' ? undefined
				: startOffset + Math.ceil((max_end.getTime() - min_start.getTime()) / WEEK_DURATION);
			const patternSlice = event.node.week_pattern.slice(startOffset, endOffset);
			let i = 0;
			for (const char of patternSlice) {
				const timePoint = document.createElement('div');
				timePoint.classList.add('__uclearn-time-point');
				if (char === '0') {
					timePoint.classList.add('__uclearn-time-point-empty');
				} else if (char === '1') {
					timePoint.classList.add('__uclearn-time-point-filled');
					const tooltip = document.createElement('div');
					tooltip.textContent = event.node.activitiesDays[i++];
					timePoint.append(tooltip);
				}
				timeline.append(timePoint);
			}
			result.append(timeline);
			return result;
		};

		// Assuming formatTimetableEvents is ready by now
		const _formatTimetableEvents = window.formatTimetableEvents;
		window.formatTimetableEvents = function (this: Window, event, eventId, _content, color, cssClass?, border?) {
			const group = window.data.student.student_enrolment[event.subject_code]
				?.groups[event.activity_group_code];
			return _formatTimetableEvents.call(this,
				event,
				eventId,
				eventContent(event, !(cssClass?.includes(ALTERNATIVE_CLASS))),
				color,
				`${cssClass ?? 'event_color_default'} ${!group.status.includes("ADJUST") ? '__uclearn-readonly'
					: group.act_cnt <= 1 ? '__uclearn-no-alternatives'
						: ''}`,
				border,
			);
		};

		// and jquery
		$.ajax({
			dataType: "json",
			url: `rest/student/${window.data.student.student_code}/connections/?ss=${window.ss}`,
			success: (e) => {
				window.checkToken(e);
				window.data.student.connections = e;
				// biome-ignore lint/style/noNonNullAssertion: assigned above
				for (const [id, student] of Object.entries(window.data.student.connections!)) {
					if (student.accepted !== 'Y') continue;
					$.ajax({
						dataType: "json",
						url: `rest/student/${window.data.student.student_code}/connection/${id}/?ss=${window.ss}`,
						success: (e) => {
							window.checkToken(e);
							connectionsCache[id] = { ...student, ...e };
							for (const evt of Object.values(window.timetable._events)) {
								updateEvent(evt);
							}
						},
						error: (e) => {
							console.error(e);
						},
					});
				}
			},
			error: (e) => {
				console.error(e);
			}
		});
	}
});

const ALTERNATIVE_CLASS = '__uclearn-alternative-event';
const UNAVAILABLE_CLASS = '__uclearn-unavailable';

const _toRemove: Set<string> = new Set();
let _changeActivity: ((el: JQuery<Element> | unknown, reload?: boolean) => void) | null = null;
const _changeActivityState: { cb?: () => void; fakeHash?: string; } = {};
document.addEventListener("mouseenter", (e) => {
	if ((e.target as Element | { classList?: undefined; } | null)?.classList?.contains('dhx_cal_event')) {
		// biome-ignore lint/style/noNonNullAssertion: error if not present plz
		const id = (e.target as Element).getAttribute('event_id')!;
		const [course, activityId,] = id.split('|');
		const li = document.querySelector(`.subject-list li[data-sub="${course}"][data-group="${activityId}"]`);
		li?.classList.add('__uclearn-activity-hover');
		li?.scrollIntoView({
			block: 'center',
			behavior: 'smooth',
		});
	}
}, { capture: true });
document.addEventListener("mouseleave", (e) => {
	if ((e.target as Element | { classList?: undefined; } | null)?.classList?.contains('dhx_cal_event')) {
		// biome-ignore lint/style/noNonNullAssertion: error if not present plz
		const id = (e.target as Element).getAttribute('event_id')!;
		const [course, activityId,] = id.split('|');
		const li = document.querySelector(`.subject-list li[data-sub="${course}"][data-group="${activityId}"]`);
		li?.classList.remove('__uclearn-activity-hover');
	}
}, { capture: true });
document.addEventListener("contextmenu", async (e) => {
	const evt = (e.target as Element).closest<HTMLElement>('#timetable-tpl .dhx_cal_event');
	if (evt) {
		e.preventDefault();
		evt.click();
		return;
	}
	const li = (e.target as Element).closest<HTMLElement>('.subject-list li');
	if (li) {
		e.preventDefault();
		const course = li.dataset.sub ?? '';
		const activityId = li.dataset.group ?? '';
		const activity = window.data.student.student_enrolment[course]?.groups[activityId];
		if (!activity) return;
		const activityEl = document.querySelector(`#timetable-tpl .dhx_cal_event[event_id^="${course}|${activityId}"]`);
		activityEl?.scrollIntoView({
			block: 'center',
			behavior: 'smooth',
		});
		const alternative = activityEl?.getAttribute('event_id')?.split('|')[2];
		// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
		const alternatives = activity.activities ?? await (activity.__uclearnActivitiesPromise ??= new Promise<Record<string, TimetableEvent>>(res => {
			let _alternatives: Record<string, TimetableEvent> | undefined = undefined;
			Object.defineProperty(activity, 'activities', {
				get: () => _alternatives,
				set(v) {
					_alternatives = v;
					res(v);
				}
			});
			window.refreshActivityGroup(course, activityId, false);
		}));
		for (const alt of Object.values(alternatives).map(alt => window.formatTimetableEvents(
			alt,
			`${alt.subject_code}|${alt.activity_group_code}|${alt.activity_code}`,
			'',
			alt.color,
			`event_color_default ${ALTERNATIVE_CLASS} ${!alternative ? '__uclearn-unassigned-readonly' :
				alt.selectable !== 'available' ? UNAVAILABLE_CLASS : ''}`,
		)[0])) {
			if (!alt || alt.node.activity_code === alternative) continue;
			_toRemove.add(alt.id);
			window.timetable.addEvent(alt);
		}
	}
}, { capture: true });
document.addEventListener("click", async e => {
	if (!e.isTrusted) return;
	const evt = (e.target as Element).closest<HTMLElement>('#timetable-tpl .dhx_cal_event');
	if (evt) {
		e.preventDefault();
		e.stopImmediatePropagation();
		// biome-ignore lint/style/noNonNullAssertion: error if not present plz
		const id = evt.getAttribute('event_id')!;
		const [course, activityId, alternative] = id.split('|');
		const activity = window.data.student.student_enrolment[course].groups[activityId];
		if (evt.classList.contains(ALTERNATIVE_CLASS)) {
			if (evt.classList.contains(UNAVAILABLE_CLASS)) return;
			if (evt.classList.contains('__uclearn-unassigned-readonly')) {
				if (!_toRemove.size)
					window.timetable.deleteEvent(id);
				else {
					_toRemove.delete(id);
					for (const id of _toRemove) {
						window.timetable.deleteEvent(id);
					}
					_toRemove.clear();
				}
				return;
			}
			_changeActivityState.cb = () => {
				window.timetableDirty &&= false;
				const old = document.querySelector(`.dhx_cal_event[event_id^="${course}|${activityId}"]:not(.${ALTERNATIVE_CLASS})`);
				const oldEvt = window.timetable.getEvent(old?.getAttribute('event_id') ?? id);
				oldEvt.css_class += ` ${ALTERNATIVE_CLASS}`;
				updateEvent(oldEvt);
				const newEvt = window.timetable.getEvent(id);
				newEvt.css_class = newEvt.css_class?.replace(ALTERNATIVE_CLASS, '');
				updateEvent(newEvt);
				_toRemove.delete(id);
				_toRemove.add(oldEvt.id);
			};
			_changeActivityState.fakeHash = `#groups/${document.querySelector(`.subject-list li[data-sub="${course}"][data-group="${activityId}"]`)?.id}`;
			_changeActivity ??= new Function('__uclrn_state', `return ${window.changeActivity.toString()
				.replace('AAInit', "return __uclrn_state.cb?.(); 0")
				.replace('window.location.hash', '__uclrn_state.fakeHash')
				}`)(_changeActivityState);
			// biome-ignore lint/style/noNonNullAssertion: assigned above
			_changeActivity!({ attr: (name: string) => ({ activity_code: alternative })[name] });
			return;
		}
		// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
		const alternatives = activity.activities ?? await (activity.__uclearnActivitiesPromise ??= new Promise<Record<string, TimetableEvent>>(res => {
			let _alternatives: Record<string, TimetableEvent> | undefined = undefined;
			Object.defineProperty(activity, 'activities', {
				get: () => _alternatives,
				set(v) {
					_alternatives = v;
					res(v);
				}
			});
			window.refreshActivityGroup(course, activityId, false);
		}));
		for (const alt of Object.values(alternatives).map(alt => window.formatTimetableEvents(
			alt,
			`${alt.subject_code}|${alt.activity_group_code}|${alt.activity_code}`,
			'',
			alt.color,
			`event_color_default ${ALTERNATIVE_CLASS} ${alt.selectable !== 'available' ? UNAVAILABLE_CLASS : ''}`,
		)[0])) {
			if (!alt || alt.node.activity_code === alternative) continue;
			_toRemove.add(alt.id);
			window.timetable.addEvent(alt);
		}
	} else {
		for (const id of _toRemove) {
			window.timetable.deleteEvent(id);
		}
		_toRemove.clear();
	}
}, { capture: true });
