// Resources & capacity data layer — extracted from index.html on 2026-05-22.
// Classic script: functions below are globals shared with the rest of the app.
// Builds the weekly capacity model from team_members + absences + allocations.
// Relies on globals defined elsewhere (RESOURCES_DATA, PROJECTS, ARCGIS_CONFIG,
// agolQuery, getPayPeriodWeek, epochToDateStr, initResourcesWeekIndices…).

// ── City holidays ──
// Global list of observed-date holidays, loaded from AGOL on each
// loadResourcesData() call. Shape: [{ objectId, date: 'YYYY-MM-DD', name }, ...].
// Empty when the holidays layer isn't configured / loaded.
var HOLIDAYS = [];
var HOLIDAYS_BY_DATE = {}; // 'YYYY-MM-DD' → holiday entry

// Returns the holiday entry for a given date string, or null.
function getHolidayForDate(dateStr) {
  if (!dateStr) return null;
  return HOLIDAYS_BY_DATE[String(dateStr).slice(0, 10)] || null;
}

// Sum of holiday hours a person loses to holidays in the given week. A
// holiday only counts when it falls on a day the person normally works
// (scheduled hours > 0) — RDOs and weekends absorb holidays without
// reducing project capacity.
function holidayHoursForPersonWeek(person, weekDateStr, weekIdx) {
  if (!HOLIDAYS.length) return 0;
  if (!weekDateStr) return 0;
  // weekDateStr is the Sunday-of-week (see generateWeeks); Monday is +1.
  var weekStart = new Date(weekDateStr + 'T00:00:00');
  weekStart.setDate(weekStart.getDate() + 1); // Sunday → Monday
  var schedule = getDailySchedule(person, weekDateStr);
  var dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];
  var total = 0;
  for (var i = 0; i < 5; i++) {
    var d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (HOLIDAYS_BY_DATE[ds]) {
      total += (schedule[dayKeys[i]] || 0);
    }
  }
  return total;
}

// True when the given week contains at least one holiday — used by the
// capacity chart to draw a subtle marker on that column.
function weekContainsHoliday(weekDateStr) {
  if (!HOLIDAYS.length || !weekDateStr) return false;
  var weekStart = new Date(weekDateStr + 'T00:00:00');
  weekStart.setDate(weekStart.getDate() + 1);
  for (var i = 0; i < 7; i++) {
    var d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (HOLIDAYS_BY_DATE[ds]) return true;
  }
  return false;
}

// Day-of-week keys ('mon'..'fri') that are city holidays within the given
// week. Used to keep holiday-day hours OUT of the personal-absence sum so
// the capacity formula doesn't double-count (holidays are subtracted
// separately by the formula already).
function holidayDaysForWeek(weekDateStr) {
  var set = {};
  if (!HOLIDAYS.length || !weekDateStr) return set;
  var weekStart = new Date(weekDateStr + 'T00:00:00');
  weekStart.setDate(weekStart.getDate() + 1);
  var keys = ['mon', 'tue', 'wed', 'thu', 'fri'];
  for (var i = 0; i < 5; i++) {
    var d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (HOLIDAYS_BY_DATE[ds]) set[keys[i]] = true;
  }
  return set;
}

// Comma-separated holiday names within a given week — used for chart tooltips.
function holidayNamesForWeek(weekDateStr) {
  if (!HOLIDAYS.length || !weekDateStr) return '';
  var weekStart = new Date(weekDateStr + 'T00:00:00');
  weekStart.setDate(weekStart.getDate() + 1);
  var names = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (HOLIDAYS_BY_DATE[ds]) names.push(HOLIDAYS_BY_DATE[ds].name);
  }
  return names.join(', ');
}

// ── Per-day schedule helpers ──
// Returns the per-day scheduled hours object for a given person + week date.
// Uses wk1_* fields on pay-period A weeks and wk2_* on B weeks (9/80 alternates;
// 5/8 schedules have identical wk1/wk2 so this still works).
function getDailySchedule(person, weekDateStr) {
  const ppWeek = (typeof getPayPeriodWeek === 'function') ? getPayPeriodWeek(weekDateStr) : 'A';
  const prefix = (ppWeek === 'A') ? 'wk1_' : 'wk2_';
  return {
    mon: person[prefix + 'mon'] || 0,
    tue: person[prefix + 'tue'] || 0,
    wed: person[prefix + 'wed'] || 0,
    thu: person[prefix + 'thu'] || 0,
    fri: person[prefix + 'fri'] || 0,
  };
}

// Distribute a weekly absence total evenly across the person's working days
// for that week (used to interpret legacy weekly absence records that pre-date
// per-day capture). Days with zero scheduled hours OR holiday days don't share
// the load — holiday days have their hours subtracted from capacity separately,
// so dumping personal absence onto them would double-charge.
function distributeAbsenceHours(totalHrs, schedule, holidayDays) {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const holDays = holidayDays || {};
  const workingDays = days.filter(function(d) { return (schedule[d] || 0) > 0 && !holDays[d]; });
  const byDay = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 };
  if (workingDays.length === 0 || totalHrs <= 0) return byDay;
  const perDay = totalHrs / workingDays.length;
  workingDays.forEach(function(d) { byDay[d] = perDay; });
  return byDay;
}

// ── Generate 52 Sunday week-start dates for a given year ──
function generateWeeks(year) {
  const weeks = [];
  const d = new Date(Date.UTC(year, 0, 1)); // Jan 1
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1); // advance to first Sunday
  for (let i = 0; i < 52; i++) {
    weeks.push(epochToDateStr(d.getTime()));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return weeks;
}

/**
 * Load resources data from four ArcGIS Online REST services and reconstruct
 * the RESOURCES_DATA object in the same shape the rendering code expects:
 * { weeks: string[], people: { [name]: { role, team, skill, proj_pct,
 *   proj_cap: number[], absences: number[], allocations: object[],
 *   weekly_allocated: number[], utilization: number[] } } }
 */
async function loadResourcesData() {
  let N = 52; // weeks per year

  // Query 4 services in parallel — holidays is optional (older deployments
  // without the table get an empty array and the feature stays inert).
  const _holidaysQ = ARCGIS_CONFIG.holidaysUrl
    ? agolQuery(ARCGIS_CONFIG.holidaysUrl).catch(function(e) { console.warn('[Resources] holidays load failed; continuing without:', e); return []; })
    : Promise.resolve([]);
  const results = await Promise.all([
    agolQuery(ARCGIS_CONFIG.teamMembersUrl),
    agolQuery(ARCGIS_CONFIG.absencesUrl),
    agolQuery(ARCGIS_CONFIG.allocationsUrl),
    _holidaysQ,
  ]);
  const memberFeatures = results[0];
  const absenceFeatures = results[1];
  const allocFeatures = results[2];
  const holidayFeatures = results[3];

  // Log first feature from each for field-name debugging
  if (memberFeatures.length) console.log('[Resources] team_members fields:', Object.keys(memberFeatures[0].attributes));
  if (absenceFeatures.length) console.log('[Resources] absences fields:', Object.keys(absenceFeatures[0].attributes));
  if (allocFeatures.length) console.log('[Resources] allocations fields:', Object.keys(allocFeatures[0].attributes));
  if (holidayFeatures.length) console.log('[Resources] holidays fields:', Object.keys(holidayFeatures[0].attributes));

  // Build the global HOLIDAYS list — { date: 'YYYY-MM-DD', name, objectId }
  // Sorted by date so the Settings UI list is naturally chronological.
  HOLIDAYS = holidayFeatures.map(function(f) {
    var a = f.attributes;
    return {
      objectId: a.OBJECTID || a.ObjectId || a.objectid,
      date: epochToDateStr(a.holiday_date),
      name: a.name || '',
    };
  }).filter(function(h) { return h.date; })
    .sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  // Lookup map for the per-day "is this a holiday?" check (used in capacity
  // calc, My Work day strip, absence editor, and the chart marker).
  HOLIDAYS_BY_DATE = {};
  HOLIDAYS.forEach(function(h) { HOLIDAYS_BY_DATE[h.date] = h; });

  // Generate weeks array (52 Sundays of 2026)
  const weeks = generateWeeks(2026);
  const weekIdx = {};
  weeks.forEach(function(w, i) { weekIdx[w] = i; });

  // Build people from team_members
  const people = {};

  memberFeatures.forEach(function(f) {
    const a = f.attributes;
    const nm = a.name;
    if (!nm) return;
    // Case-insensitive field lookup helper (ArcGIS may alter field name casing)
    const keys = Object.keys(a);
    const ci = function(target) {
      const found = keys.find(function(k) { return k.toLowerCase() === target.toLowerCase(); });
      return found ? a[found] : undefined;
    };
    // TimeOnly field helper: ArcGIS may return ms since midnight OR "HH:MM:SS" string
    const toHHMM = function(val) {
      if (val == null || val === '') return null;
      if (typeof val === 'string' && val.indexOf(':') >= 0) return val.slice(0, 5); // "HH:MM:SS" → "HH:MM"
      if (typeof val === 'number') {
        const totalMin = Math.floor(val / 60000);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
      }
      return null;
    };

    const dayKeys = ['mon','tue','wed','thu','fri'];
    const lunchMin = ci('lunch_minutes');
    const lunch = (lunchMin != null) ? lunchMin : 60;

    // Read start/end times for both weeks
    const schedule = {};
    ['wk1','wk2'].forEach(function(wk) {
      dayKeys.forEach(function(d) {
        schedule[wk + '_' + d + '_start'] = toHHMM(ci(wk + '_' + d + '_start'));
        schedule[wk + '_' + d + '_end']   = toHHMM(ci(wk + '_' + d + '_end'));
      });
    });

    // Compute daily hours from start/end/lunch
    function computeDayHours(startStr, endStr, lunchMins) {
      if (!startStr || !endStr) return 0;
      const sp = startStr.split(':'), ep = endStr.split(':');
      const startMins = parseInt(sp[0]) * 60 + parseInt(sp[1]);
      const endMins = parseInt(ep[0]) * 60 + parseInt(ep[1]);
      const worked = (endMins - startMins) / 60 - (lunchMins / 60);
      return Math.max(0, Math.round(worked * 100) / 100);
    }

    const dailyHours = {};
    let week1_hours = 0, week2_hours = 0;
    ['wk1','wk2'].forEach(function(wk) {
      dayKeys.forEach(function(d) {
        const hrs = computeDayHours(schedule[wk+'_'+d+'_start'], schedule[wk+'_'+d+'_end'], lunch);
        dailyHours[wk + '_' + d] = hrs;
        if (wk === 'wk1') week1_hours += hrs;
        else week2_hours += hrs;
      });
    });

    people[nm] = {
      objectId:         ci('objectid') || a.objectid || a.OBJECTID || a.ObjectId,
      user_preferences: ci('user_preferences') || null,
      position_title:   ci('position_title') || '',
      // Org-rename: prefer the new owning_unit / owning_team columns; fall
      // back to legacy role / team for any records not yet backfilled.
      // Local model keeps the role / team key names so existing consumers
      // (settings table, my-work header, etc.) keep working without edits.
      role:             a.owning_unit || a.role || '',
      team:             a.owning_team || a.team || '',
      skill:            a.skill || ci('skill') || '',
      proj_pct:         a.proj_pct || 0,
      schedule_type:    ci('schedule_type') || '5/8',
      week1_hours:      week1_hours,
      week2_hours:      week2_hours,
      rdo_day:          ci('rdo_day') || null,
      lunch_minutes:    lunch,
      schedule:         schedule,       // raw start/end strings
      wk1_mon: dailyHours.wk1_mon, wk1_tue: dailyHours.wk1_tue, wk1_wed: dailyHours.wk1_wed,
      wk1_thu: dailyHours.wk1_thu, wk1_fri: dailyHours.wk1_fri,
      wk2_mon: dailyHours.wk2_mon, wk2_tue: dailyHours.wk2_tue, wk2_wed: dailyHours.wk2_wed,
      wk2_thu: dailyHours.wk2_thu, wk2_fri: dailyHours.wk2_fri,
      time_tracking:    (ci('time_tracking') === 'true' || ci('time_tracking') === true || ci('time_tracking') === 1) ? true : false,
      active:           (ci('active') === 'false' || ci('active') === false || ci('active') === 0) ? false : true,
      tracking_level:   ci('tracking_level') || 'full',
      member_group:     ci('member_group') || 'Data Intelligence',
      data_program_lead_team: ci('data_program_lead_team') || null,
      proj_cap:         new Array(N).fill(0),
      absences:         new Array(N).fill(0),
      // Per-day absence breakdown — one entry per week, value is { mon, tue, wed, thu, fri }.
      // Sum of a week's day fields equals absences[wi] (invariant maintained on read + save).
      absencesByDay:    Array.from({ length: N }, function() { return { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 }; }),
      allocations:      [],
      weekly_allocated: new Array(N).fill(0),
      utilization:      new Array(N).fill(0),
    };

    // Auto-derive schedule from schedule_type when all start/end fields are null
    const p = people[nm];
    const hasAnySchedule = Object.values(p.schedule).some(function(v) { return v != null; });
    if (!hasAnySchedule) {
      const sched = p.schedule_type || '5/8';
      const rdoIdx = p.rdo_day ? ['Monday','Tuesday','Wednesday','Thursday','Friday'].indexOf(p.rdo_day) : -1;
      const defaultSchedules = {
        '5/8':  { start: '08:00', end: '17:00', wkAShort: null, wkBOff: false },
        '4/10': { start: '07:00', end: '18:00', wkAShort: null, wkBOff: false },
        '9/80': { start: '07:00', end: '17:00', wkAShort: '07:00-16:00', wkBOff: true },
      };
      const def = defaultSchedules[sched] || defaultSchedules['5/8'];
      ['wk1','wk2'].forEach(function(wk) {
        dayKeys.forEach(function(d, i) {
          if (sched === '4/10' && i === rdoIdx) {
            p.schedule[wk+'_'+d+'_start'] = null;
            p.schedule[wk+'_'+d+'_end'] = null;
          } else if (sched === '9/80' && i === rdoIdx) {
            if (wk === 'wk1') {
              // Week A: short day (8h) on RDO day
              p.schedule[wk+'_'+d+'_start'] = '07:00';
              p.schedule[wk+'_'+d+'_end'] = '16:00';
            } else {
              // Week B: day off
              p.schedule[wk+'_'+d+'_start'] = null;
              p.schedule[wk+'_'+d+'_end'] = null;
            }
          } else {
            p.schedule[wk+'_'+d+'_start'] = def.start;
            p.schedule[wk+'_'+d+'_end'] = sched === '9/80' ? '17:00' : def.end;
          }
        });
      });
      // Recompute daily hours and week totals
      p.week1_hours = 0; p.week2_hours = 0;
      ['wk1','wk2'].forEach(function(wk) {
        dayKeys.forEach(function(d) {
          const hrs = computeDayHours(p.schedule[wk+'_'+d+'_start'], p.schedule[wk+'_'+d+'_end'], p.lunch_minutes);
          p[wk + '_' + d] = hrs;
          if (wk === 'wk1') p.week1_hours += hrs;
          else p.week2_hours += hrs;
        });
      });
    }
  });

  // Fill absences — per-day model with backwards-compatible distribution.
  // If the AGOL record has explicit per-day hours (mon_hrs..fri_hrs), use them.
  // If it has only the legacy absence_hours total, distribute evenly across
  // that person's working days for the week (Mon..Fri filtered by their
  // scheduled hours, A vs B for 9/80 schedules). The invariant
  //   absences[wi] === sum(absencesByDay[wi])
  // is maintained either way, so the existing capacity formula
  // (scheduled_hours - absences[wi]) × productivity × proj_pct still works.
  absenceFeatures.forEach(function(f) {
    const a = f.attributes;
    const nm = a.name;
    const wk = epochToDateStr(a.week_date);
    if (!people[nm] || weekIdx[wk] === undefined) return;
    const wi = weekIdx[wk];
    const p = people[nm];
    const totalHrs = a.absence_hours || 0;
    const mon = a.mon_hrs || 0, tue = a.tue_hrs || 0, wed = a.wed_hrs || 0, thu = a.thu_hrs || 0, fri = a.fri_hrs || 0;
    const byDayRaw = { mon: mon, tue: tue, wed: wed, thu: thu, fri: fri };
    const dayTotal = mon + tue + wed + thu + fri;
    // Holidays are subtracted from capacity separately, so day values that
    // fall on a holiday must NOT flow into the personal-absence sum — that
    // would double-charge. The raw per-day values stay in absencesByDay
    // (preserved for round-trip if the holiday is later removed), but the
    // running absences[wi] used by the capacity formula only counts
    // non-holiday days.
    const holDays = holidayDaysForWeek(weeks[wi]);
    const nonHolidayTotal = ['mon', 'tue', 'wed', 'thu', 'fri']
      .reduce(function(s, d) { return s + (holDays[d] ? 0 : (byDayRaw[d] || 0)); }, 0);
    if (dayTotal > 0) {
      p.absencesByDay[wi] = byDayRaw;
      p.absences[wi] = nonHolidayTotal;
    } else if (totalHrs > 0) {
      // Legacy weekly record — distribute evenly across working, non-holiday days
      p.absencesByDay[wi] = distributeAbsenceHours(totalHrs, getDailySchedule(p, weeks[wi]), holDays);
      // After distribution, the legacy total already excludes holiday days
      // (they got 0 share), so the sum equals the post-distribution total.
      p.absences[wi] = ['mon', 'tue', 'wed', 'thu', 'fri']
        .reduce(function(s, d) { return s + (p.absencesByDay[wi][d] || 0); }, 0);
    }
  });

  // Compute capacity, allocations, and utilization
  computeCapacityAndAllocations(people, weeks, weekIdx, allocFeatures, N);

  RESOURCES_DATA = { weeks: weeks, people: people, _memberFieldNames: memberFeatures.length ? Object.keys(memberFeatures[0].attributes) : [] };
  console.log('[Resources] Loaded:', memberFeatures.length, 'members,', absenceFeatures.length, 'absence records,',
    allocFeatures.length, 'allocation records');
}

function computeCapacityAndAllocations(people, weeks, weekIdx, allocFeatures, N) {
  // Compute proj_cap from formula:
  //   (scheduled_hours - absence_hours - holiday_hours) × _productivityRatio × proj_pct
  // _productivityRatio (default 0.75, admin-tunable) accounts for non-project overhead.
  // For 9/80 schedules, Week A = week1_hours (44), Week B = week2_hours (36).
  // Holidays are subtracted on top of personal absences and only count when
  // they fall on a day the person normally works (handled inside the helper).
  Object.entries(people).forEach(function(entry) {
    const p = entry[1];
    for (let i = 0; i < N; i++) {
      const ppWeek = getPayPeriodWeek(weeks[i]);
      const scheduledHours = (ppWeek === 'A') ? p.week1_hours : p.week2_hours;
      const holidayHrs = holidayHoursForPersonWeek(p, weeks[i], i);
      p.proj_cap[i] = (scheduledHours - (p.absences[i] || 0) - holidayHrs) * _productivityRatio * p.proj_pct;
      if (p.proj_cap[i] < 0) p.proj_cap[i] = 0; // clamp absence + holiday over-subtraction
    }
  });

  // Build allocations grouped by person+project. The denormalized fields
  // (project, project_status, project_type, hours) were dropped from
  // allocations in the migration (decisions AL1=a, AL2=a). Look up the
  // project metadata by project_number FK and recompute hours from
  // fraction × proj_cap.
  const allocMap = {}; // key: "name|project_title"
  allocFeatures.forEach(function(f) {
    const a = f.attributes;
    const projNum = a.project_number || a.analytics_id || '';
    const proj = projNum ? PROJECTS.find(function(p) { return p.project_number === projNum; }) : null;
    const projTitle = proj ? proj.title : (a.project || '(unknown project)');
    const key = a.name + '|' + projTitle;
    const wk = epochToDateStr(a.week_date);
    const wi = weekIdx[wk];
    if (wi === undefined) return;

    if (!allocMap[key]) {
      allocMap[key] = {
        project:      projTitle,
        status:       proj ? (proj.status || '') : (a.project_status || ''),
        type:         proj ? (proj.category || '') : (a.project_type || ''),
        analytics_id: projNum || null,
        role:         a.project_role || '',
        fracs:        new Array(N).fill(0),
        hours:        new Array(N).fill(0),
        _name:        a.name,
      };
    }
    // If role wasn't set on earlier record but is on this one, capture it
    if (!allocMap[key].role && a.project_role) allocMap[key].role = a.project_role;
    allocMap[key].fracs[wi] = a.fraction || 0;
    // Recompute hours from fraction × this person's proj_cap for the week.
    const personProjCap = (people[a.name] && people[a.name].proj_cap && people[a.name].proj_cap[wi]) || 0;
    allocMap[key].hours[wi] = (a.fraction || 0) * personProjCap;
  });

  // Attach allocations to people
  Object.values(allocMap).forEach(function(alloc) {
    const nm = alloc._name;
    delete alloc._name;
    if (people[nm]) {
      people[nm].allocations.push(alloc);
    }
  });

  // Recompute allocation hours from fractions and local proj_cap
  Object.values(people).forEach(function(p) {
    p.allocations.forEach(function(a) {
      for (let i = 0; i < N; i++) {
        a.hours[i] = (a.fracs[i] || 0) * p.proj_cap[i];
      }
    });
  });

  // Compute weekly_allocated and utilization
  Object.values(people).forEach(function(p) {
    for (let i = 0; i < N; i++) {
      let totalHrs = 0;
      p.allocations.forEach(function(a) { totalHrs += (a.hours[i] || 0); });
      p.weekly_allocated[i] = totalHrs;
      p.utilization[i] = p.proj_cap[i] > 0 ? totalHrs / p.proj_cap[i] : 0;
    }
  });
}

// Reload RESOURCES_DATA after a write, retrying briefly if the just-written
// change hasn't propagated yet (AGOL read-after-write lag). verifyFn() returns
// true once the expected post-condition is visible in RESOURCES_DATA; if it
// never does, we proceed anyway (the next refresh self-heals). Worst case with
// no verifyFn = a single reload, identical to the old behavior.
async function reloadResourcesUntil(verifyFn, label) {
  await loadResourcesData();
  if (typeof initResourcesWeekIndices === 'function') initResourcesWeekIndices();
  if (typeof verifyFn !== 'function' || verifyFn()) return;
  var delays = [500, 1200];
  for (var i = 0; i < delays.length && !verifyFn(); i++) {
    console.log('[Reload] ' + (label || 'resources') + ' not consistent yet — retrying in ' + delays[i] + 'ms');
    await new Promise(function(r) { setTimeout(r, delays[i]); });
    await loadResourcesData();
    if (typeof initResourcesWeekIndices === 'function') initResourcesWeekIndices();
  }
  if (!verifyFn()) console.warn('[Reload] ' + (label || 'resources') + ' still inconsistent after retries; will self-heal on next refresh.');
}
