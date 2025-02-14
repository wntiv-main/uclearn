interface TimetableEvent {
	activitiesDays: string[];
	activityType: string;
	activity_code: string;
	activity_group_code: string;
	activity_size?: number;
	attendanceStatus?: string;
	attendanceStudent?: number | `${number}`;
	attendanceUpdatedBy?: string;
	availability: number;
	buffer?: number;
	campus?: string;
	campus_description?: string;
	capacity?: number | `${number}`;
	color?: string;
	day_of_week: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
	department: string;
	description: string;
	displaySubjectCode: string;
	duration?: number | `${number}`;
	group_status?: string;
	lat?: unknown;
	lng?: unknown;
	location: string;
	locations: {
		activityDays: string[];
		description?: string;
		id: string;
		lat?: unknown;
		lng?: unknown;
	}[];
	record_attendance?: boolean;
	section_code?: string;
	semester: string;
	semester_description: string;
	source?: string;
	staff?: string;
	start_date: string;
	start_time?: string;
	student_count: number;
	subject_code: string;
	subject_description?: string;
	timezone?: string;
	week_pattern: string;
	zone?: string;
	selectable?: string;
	qualify?: string;
};

interface TimetableNode {
	border?: string;
	'border-width'?: string;
	border_style?: string;
	color?: string;
	css_class?: string;
	cursor?: string;
	end_date: Date;
	height?: string;
	id: string;
	node: TimetableEvent;
	start_date: Date;
	text: string;
	visible?: boolean;
	_count?: number;
	_inner?: boolean;
	_sday?: number;
	_sorder?: number;
	_timed?: boolean;
}

export interface Scheduler {
	_events: Record<string, TimetableNode>;
	_loading?: boolean;
	event_updated(evt: TimetableNode): void;
	callEvent(event: string, data: unknown): void;
	// render_event(e: TimetableEvent);
	addEvent(evt: TimetableNode): void;
	deleteEvent(id: string): void;
	getEvent(id: string): TimetableNode;
	getRenderedEvent(id: string): Element;
	_render_v_bar(eventId: string, x: number, y: number, w: number, h: number, styles: string, title: string, body: string, selectMenu?: unknown): HTMLElement;
}

type formatTimetableEventsType = (event: TimetableEvent, eventId: string, content: string, color?: string, cssClass?: string, border?: string) => [TimetableNode] | [];

export interface Connection {
	accepted: _boolean;
	connected_student_code: number | `${number}`;
	first_name: string;
	last_name: string;
	student_code: number | `${number}`;
}

type _boolean = "Y" | "N";

declare global {
	interface Window {
		ss?: string;
		checkToken(response: unknown): void;
		timetableDirty?: boolean;
		formatTimetableEvents: formatTimetableEventsType;
		refreshActivityGroup(courseId: string, activityId: string, render?: boolean, async?: boolean): void;
		changeActivity(el: JQuery<Element>, reload?: boolean): void;
		timetable: Scheduler,
		data: {
			student: {
				connections?: Record<number, Connection>;
				alerts?: unknown[];
				allocated: Record<string, TimetableEvent>;
				attend_type?: string;
				email_address: string;
				exams?: unknown;
				external_activities?: unknown;
				first_name: string;
				flagged?: unknown[];
				ical_subscriptions?: unknown;
				last_name: string;
				newPreferences?: unknown;
				planned?: unknown;
				planned_unavailable?: unknown;
				preferences?: unknown;
				preferred_name: string;
				section_preferences?: unknown;
				section_preferences_grid?: unknown;
				singleOptionPrefs?: unknown;
				sorted_display: Record<string, unknown>;
				student_code: number | `${number}`;
				student_enrolment: Record<string, {
					callista_code: string;
					campus?: string;
					campus_description?: string;
					description: string;
					displaySubjectCode: string;
					display_subject_code: string;
					email_address: string;
					faculty: string;
					groups: Record<string, {
						__uclearnActivitiesPromise?: Promise<Record<string, TimetableEvent>>;
						act_cnt: number;
						activities?: Record<string, TimetableEvent>;
						activity_group_code: string;
						allow_justification: _boolean;
						allow_waitlist: _boolean;
						auto_single: _boolean;
						description: string;
						displaySubjectCode: string;
						min_prefs?: unknown;
						num_flagged_timeslots?: unknown;
						show_availability: _boolean;
						status: string;
						subject_code: string;
					}>;
					manager: string;
					semester: string;
					semester_description: string;
					showOnTT: _boolean;
					subject_code: string;
					timezone: string;
					transDisplaySubjectCode: string;
				}>;
				waitlist?: unknown;
				workgroups: unknown;
			};
			semesters: unknown;
		};
	}
}
