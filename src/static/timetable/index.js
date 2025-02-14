// src/timetable/index.ts
function eventContent(event, showMismatch) {
  const connections = Object.entries(connectionsCache).flatMap(([id, connection]) => {
    if (`${event.subject_code}||${event.activity_group_code}||${event.activity_code}` in connection.allocated)
      return `<div class="__uclearn-user-profile" title="${connection.first_name} ${connection.last_name}">				${connection.first_name[0]}${connection.last_name[0]}
			</div>`;
    if (showMismatch) {
      for (const key of Object.keys(connection.allocated))
        if (key.startsWith(`${event.subject_code}||${event.activity_group_code}||`))
          return `<div class="__uclearn-user-profile __uclearn-mismatch" title="${connection.first_name} ${connection.last_name}">					${connection.first_name[0]}${connection.last_name[0]}
				</div>`;
    }
    return [];
  });
  const location = event.location.length > 20 ? `${event.location.slice(0, 17)}...` : event.location;
  return `${event.displaySubjectCode} - ${event.activity_group_code} [${event.activity_code}]<br>${location}			<div class="__uclearn-profile-set">${connections.join("")}</div>`;
}
function updateEvent(evt) {
  evt.text = eventContent(evt.node, !evt.css_class?.includes(ALTERNATIVE_CLASS));
  window.timetable.event_updated(evt);
  if (!window.timetable._loading)
    window.timetable.callEvent("onEventChanged", [evt.id, evt]);
}
var connectionsCache = {};
var _scheduler;
var WEEK_DURATION = 7 * 24 * 60 * 60 * 1000;
Object.defineProperty(window, "timetable", {
  get: () => _scheduler,
  set(v) {
    _scheduler = v;
    const _render = _scheduler._render_v_bar;
    _scheduler._render_v_bar = function(eventId, ...args) {
      const result = _render.call(this, eventId, ...args);
      const timeline = document.createElement("div");
      timeline.classList.add("__uclearn-timeline");
      const event = this.getEvent(eventId);
      const [d, m, y] = event.node.start_date.split("/").map((x) => Number.parseInt(x));
      const startOffset = typeof min_start === "undefined" ? 0 : Math.floor((min_start.getTime() - new Date(y, m - 1, d).getTime()) / WEEK_DURATION);
      const endOffset = typeof min_start === "undefined" || typeof max_end === "undefined" ? undefined : startOffset + Math.ceil((max_end.getTime() - min_start.getTime()) / WEEK_DURATION);
      const patternSlice = event.node.week_pattern.slice(startOffset, endOffset);
      let i = 0;
      for (const char of patternSlice) {
        const timePoint = document.createElement("div");
        timePoint.classList.add("__uclearn-time-point");
        if (char === "0") {
          timePoint.classList.add("__uclearn-time-point-empty");
        } else if (char === "1") {
          timePoint.classList.add("__uclearn-time-point-filled");
          const tooltip = document.createElement("div");
          tooltip.textContent = event.node.activitiesDays[i++];
          timePoint.append(tooltip);
        }
        timeline.append(timePoint);
      }
      result.append(timeline);
      return result;
    };
    const _formatTimetableEvents = window.formatTimetableEvents;
    window.formatTimetableEvents = function(event, eventId, _content, color, cssClass, border) {
      const group = window.data.student.student_enrolment[event.subject_code]?.groups[event.activity_group_code];
      return _formatTimetableEvents.call(this, event, eventId, eventContent(event, !cssClass?.includes(ALTERNATIVE_CLASS)), color, `${cssClass ?? "event_color_default"} ${!group.status.includes("ADJUST") ? "__uclearn-readonly" : group.act_cnt <= 1 ? "__uclearn-no-alternatives" : ""}`, border);
    };
    $.ajax({
      dataType: "json",
      url: `rest/student/${window.data.student.student_code}/connections/?ss=${window.ss}`,
      success: (e) => {
        window.checkToken(e);
        window.data.student.connections = e;
        for (const [id, student] of Object.entries(window.data.student.connections)) {
          if (student.accepted !== "Y")
            continue;
          $.ajax({
            dataType: "json",
            url: `rest/student/${window.data.student.student_code}/connection/${id}/?ss=${window.ss}`,
            success: (e2) => {
              window.checkToken(e2);
              connectionsCache[id] = { ...student, ...e2 };
              for (const evt of Object.values(window.timetable._events)) {
                updateEvent(evt);
              }
            },
            error: (e2) => {
              console.error(e2);
            }
          });
        }
      },
      error: (e) => {
        console.error(e);
      }
    });
  }
});
var ALTERNATIVE_CLASS = "__uclearn-alternative-event";
var UNAVAILABLE_CLASS = "__uclearn-unavailable";
var _toRemove = new Set;
var _changeActivity = null;
var _changeActivityState = {};
document.addEventListener("mouseenter", (e) => {
  if (e.target?.classList?.contains("dhx_cal_event")) {
    const id = e.target.getAttribute("event_id");
    const [course, activityId] = id.split("|");
    const li = document.querySelector(`.subject-list li[data-sub="${course}"][data-group="${activityId}"]`);
    li?.classList.add("__uclearn-activity-hover");
    li?.scrollIntoView({
      block: "center",
      behavior: "smooth"
    });
  }
}, { capture: true });
document.addEventListener("mouseleave", (e) => {
  if (e.target?.classList?.contains("dhx_cal_event")) {
    const id = e.target.getAttribute("event_id");
    const [course, activityId] = id.split("|");
    const li = document.querySelector(`.subject-list li[data-sub="${course}"][data-group="${activityId}"]`);
    li?.classList.remove("__uclearn-activity-hover");
  }
}, { capture: true });
document.addEventListener("contextmenu", async (e) => {
  const evt = e.target.closest("#timetable-tpl .dhx_cal_event");
  if (evt) {
    e.preventDefault();
    evt.click();
    return;
  }
  const li = e.target.closest(".subject-list li");
  if (li) {
    e.preventDefault();
    const course = li.dataset.sub ?? "";
    const activityId = li.dataset.group ?? "";
    const activity = window.data.student.student_enrolment[course]?.groups[activityId];
    if (!activity)
      return;
    const activityEl = document.querySelector(`#timetable-tpl .dhx_cal_event[event_id^="${course}|${activityId}"]`);
    activityEl?.scrollIntoView({
      block: "center",
      behavior: "smooth"
    });
    const alternative = activityEl?.getAttribute("event_id")?.split("|")[2];
    const alternatives = activity.activities ?? await (activity.__uclearnActivitiesPromise ??= new Promise((res) => {
      let _alternatives = undefined;
      Object.defineProperty(activity, "activities", {
        get: () => _alternatives,
        set(v) {
          _alternatives = v;
          res(v);
        }
      });
      window.refreshActivityGroup(course, activityId, false);
    }));
    for (const alt of Object.values(alternatives).map((alt2) => window.formatTimetableEvents(alt2, `${alt2.subject_code}|${alt2.activity_group_code}|${alt2.activity_code}`, "", alt2.color, `event_color_default ${ALTERNATIVE_CLASS} ${!alternative ? "__uclearn-unassigned-readonly" : alt2.selectable !== "available" ? UNAVAILABLE_CLASS : ""}`)[0])) {
      if (!alt || alt.node.activity_code === alternative)
        continue;
      _toRemove.add(alt.id);
      window.timetable.addEvent(alt);
    }
  }
}, { capture: true });
document.addEventListener("click", async (e) => {
  if (!e.isTrusted)
    return;
  const evt = e.target.closest("#timetable-tpl .dhx_cal_event");
  if (evt) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const id = evt.getAttribute("event_id");
    const [course, activityId, alternative] = id.split("|");
    const activity = window.data.student.student_enrolment[course].groups[activityId];
    if (evt.classList.contains(ALTERNATIVE_CLASS)) {
      if (evt.classList.contains(UNAVAILABLE_CLASS))
        return;
      if (evt.classList.contains("__uclearn-unassigned-readonly")) {
        if (!_toRemove.size)
          window.timetable.deleteEvent(id);
        else {
          _toRemove.delete(id);
          for (const id2 of _toRemove) {
            window.timetable.deleteEvent(id2);
          }
          _toRemove.clear();
        }
        return;
      }
      _changeActivityState.cb = () => {
        window.timetableDirty &&= false;
        const old = document.querySelector(`.dhx_cal_event[event_id^="${course}|${activityId}"]:not(.${ALTERNATIVE_CLASS})`);
        const oldEvt = window.timetable.getEvent(old?.getAttribute("event_id") ?? id);
        oldEvt.css_class += ` ${ALTERNATIVE_CLASS}`;
        updateEvent(oldEvt);
        const newEvt = window.timetable.getEvent(id);
        newEvt.css_class = newEvt.css_class?.replace(ALTERNATIVE_CLASS, "");
        updateEvent(newEvt);
        _toRemove.delete(id);
        _toRemove.add(oldEvt.id);
      };
      _changeActivityState.fakeHash = `#groups/${document.querySelector(`.subject-list li[data-sub="${course}"][data-group="${activityId}"]`)?.id}`;
      _changeActivity ??= new Function("__uclrn_state", `return ${window.changeActivity.toString().replace("AAInit", "return __uclrn_state.cb?.(); 0").replace("window.location.hash", "__uclrn_state.fakeHash")}`)(_changeActivityState);
      _changeActivity({ attr: (name) => ({ activity_code: alternative })[name] });
      return;
    }
    const alternatives = activity.activities ?? await (activity.__uclearnActivitiesPromise ??= new Promise((res) => {
      let _alternatives = undefined;
      Object.defineProperty(activity, "activities", {
        get: () => _alternatives,
        set(v) {
          _alternatives = v;
          res(v);
        }
      });
      window.refreshActivityGroup(course, activityId, false);
    }));
    for (const alt of Object.values(alternatives).map((alt2) => window.formatTimetableEvents(alt2, `${alt2.subject_code}|${alt2.activity_group_code}|${alt2.activity_code}`, "", alt2.color, `event_color_default ${ALTERNATIVE_CLASS} ${alt2.selectable !== "available" ? UNAVAILABLE_CLASS : ""}`)[0])) {
      if (!alt || alt.node.activity_code === alternative)
        continue;
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
