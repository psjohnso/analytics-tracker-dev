// ─────────────────────────────────────────────────────────────────────
// staffing-planner.js — beta: ranked staffing candidates on the
//   OE Weekly Idea Review.
//
// Gated by isFeatureOn('staffingPlanner'). When on, the OE Idea Review
// replaces its existing "Team availability" expander with a richer
// staffing panel:
//   - per-person × per-category history from completed PROJECTS
//     (count led, on-time rate as lead, last completion date)
//   - fit score = 40% on-time + 40% completed + 20% recency
//   - per-candidate calibrated forecast using the category's learned
//     Schedule Multiplier (same math as Insights' Duration Calibration)
//   - inline lead pick; when set, Active / Scheduled routes go through
//     a confirmation modal that writes a [Staffing] journal entry on
//     the new project.
//
// Forward references resolved at call time: PROJECTS, RESOURCES_DATA,
// SIZE_DURATIONS, _allocationDefaults, fcAvailData, findEarliestStart,
// cpWeekLabel, inCurrentTeamPerson, teamProjects, DataStore,
// addProjectNote (project-notes.js), markDirty, markDataDirty,
// showToast, render, renderIdeaReviewOE, promoteIdea (legacy fallback),
// esc.
// ─────────────────────────────────────────────────────────────────────

(function() {

  // Module-local: { ideaObjectId: { name, size } } — picked lead per
  // idea, scoped to the in-memory render cycle. Resets on full render
  // and on successful promotion. The size is captured here too so
  // changing the dropdown after picking a lead recomputes the forecast
  // against the new size.
  var _pickedLead = {};
  // Module-local: { ideaObjectId: size } — selected size for an idea
  // when no lead is picked yet (so the size dropdown survives panel
  // re-renders). Falls back to p.project_size or 'M'.
  var _selectedSize = {};

  // ── Category multiplier (Schedule Multiplier from completed projects)
  // Mirrors the math in projectScheduleForecast() over in insights.js,
  // but returns { value, n } so we can show "12 completions" alongside.
  // Uses original commitment (end_date) on both sides; working_due
  // drifts during a project's life, so end_date is the stable baseline.
  function _categoryMultiplier(category) {
    if (!category) return null;
    var WK = 7 * 86400000;
    var twelveMoAgoMs = Date.now() - 365 * 86400000;
    var all = (typeof teamProjects === 'function'
      ? teamProjects()
      : (typeof PROJECTS !== 'undefined' ? PROJECTS : [])) || [];
    var mults = [];
    all.forEach(function(p) {
      if (p.status !== 'Complete' || !p.actual_end || !p.start || !p.end) return;
      if ((p.category || '') !== category) return;
      var actualMs = new Date(p.actual_end + 'T12:00:00').getTime();
      if (actualMs < twelveMoAgoMs) return;
      var startMs = new Date(p.start + 'T12:00:00').getTime();
      var endMs   = new Date(p.end   + 'T12:00:00').getTime();
      var pw = (endMs - startMs) / WK;
      var aw = (actualMs - startMs) / WK;
      if (pw > 0 && aw > 0) mults.push(aw / pw);
    });
    if (mults.length < 3) return null;
    mults.sort(function(a, b) { return a - b; });
    var mid = Math.floor(mults.length / 2);
    var median = mults.length % 2 ? mults[mid] : (mults[mid - 1] + mults[mid]) / 2;
    if (!isFinite(median) || median <= 0) return null;
    return { value: median, n: mults.length };
  }

  // ── Per-person × per-category history
  // For the fit score, only LEAD completions count toward count + on-time.
  // Contributor count is surfaced as context but doesn't move the score —
  // distinguishing lead vs contributor for non-leads is best-effort
  // (text-match on other_members) and we don't want noisy fit numbers
  // based on a fuzzy signal.
  function getPersonCategoryHistory(name, category) {
    if (!name || !category) return null;
    var all = (typeof PROJECTS !== 'undefined') ? PROJECTS : [];
    var ledComplete = [];
    var contribComplete = 0;
    all.forEach(function(p) {
      if (p.status !== 'Complete') return;
      if ((p.category || '') !== category) return;
      if (p.contact === name) {
        ledComplete.push(p);
      } else {
        var others = String(p.other_members || '');
        if (others.indexOf(name) >= 0) contribComplete++;
      }
    });
    var ledOnTime = 0;
    ledComplete.forEach(function(p) {
      if (p.actual_end && p.end && p.actual_end <= p.end) ledOnTime++;
    });
    var lastDate = null;
    ledComplete.forEach(function(p) {
      if (p.actual_end && (!lastDate || p.actual_end > lastDate)) lastDate = p.actual_end;
    });
    return {
      ledCount:     ledComplete.length,
      ledOnTime:    ledOnTime,
      onTimeRate:   ledComplete.length > 0 ? ledOnTime / ledComplete.length : null,
      contribCount: contribComplete,
      lastDate:     lastDate
    };
  }

  // ── Fit score 0–100
  // Weights from user decision: 40% on-time, 40% completed, 20% recency.
  // - On-time: rate × 100 (cap 100)
  // - Completed: saturates at 8 led projects (so 8+ leads = full 100)
  // - Recency: linear decay from 100 at 0 mo → 0 at 18 mo since last led
  function computeFitScore(history) {
    if (!history) return 0;
    var onTime    = history.onTimeRate != null ? history.onTimeRate * 100 : 0;
    var completed = Math.min(100, (history.ledCount / 8) * 100);
    var recency   = 0;
    if (history.lastDate) {
      var monthsSince = (Date.now() - new Date(history.lastDate + 'T12:00:00').getTime()) / (30 * 86400000);
      recency = Math.max(0, 100 - (monthsSince / 18) * 100);
    }
    return Math.round(0.40 * onTime + 0.40 * completed + 0.20 * recency);
  }

  // ── Rank candidates for this idea + size
  function rankCandidatesForIdea(idea, size) {
    if (!idea) return [];
    var category = idea.category || '';
    if (!category) return [];

    var avData = (typeof fcAvailData === 'function') ? fcAvailData() : {};
    var people = Object.keys(avData);
    if (typeof inCurrentTeamPerson === 'function') {
      people = people.filter(inCurrentTeamPerson);
    }

    var mult = _categoryMultiplier(category);
    var sizeWeeks = (typeof SIZE_DURATIONS !== 'undefined' && SIZE_DURATIONS[size]) || 6;
    var curIdx = (typeof window !== 'undefined' && typeof window.currentWeekIdx === 'number') ? window.currentWeekIdx : 9;

    var ranked = people.map(function(name) {
      var history = getPersonCategoryHistory(name, category);
      var fit = computeFitScore(history);
      var earliest = (typeof findEarliestStart === 'function')
        ? findEarliestStart(avData, name, size, 'Lead')
        : { startWeek: -1, blockers: [] };
      var startWk = earliest.startWeek;
      var calibratedWks = mult ? Math.round(sizeWeeks * mult.value * 10) / 10 : sizeWeeks;
      var startDate = null, endDate = null;
      if (startWk >= 0 && typeof RESOURCES_DATA !== 'undefined' && RESOURCES_DATA.weeks && RESOURCES_DATA.weeks[startWk]) {
        var sd = new Date(RESOURCES_DATA.weeks[startWk] + 'T12:00:00');
        sd.setDate(sd.getDate() + 1); // Sun → Mon (matches Forecast convention)
        startDate = sd.toISOString().slice(0, 10);
        var ed = new Date(sd.getTime() + calibratedWks * 7 * 86400000);
        endDate = ed.toISOString().slice(0, 10);
      }
      return {
        name:          name,
        role:          (avData[name] || {}).role || '',
        history:       history,
        fit:           fit,
        earliestStart: startWk,
        startDate:     startDate,
        endDate:       endDate,
        calibratedWks: calibratedWks,
        plannedWks:    sizeWeeks,
        multiplier:    mult,
        atCapacity:    startWk === -1,
        availableNow:  startWk >= 0 && startWk <= curIdx
      };
    });

    ranked.sort(function(a, b) {
      if (b.fit !== a.fit) return b.fit - a.fit;
      var aw = a.earliestStart === -1 ? 999 : a.earliestStart;
      var bw = b.earliestStart === -1 ? 999 : b.earliestStart;
      return aw - bw;
    });
    return ranked;
  }

  // ── Helpers
  function _shortDate(dStr) {
    if (!dStr) return '—';
    var d = new Date(dStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function _availabilityPill(startWk) {
    var curIdx = (typeof window !== 'undefined' && typeof window.currentWeekIdx === 'number') ? window.currentWeekIdx : 9;
    if (startWk === -1) return '<span class="sp-pill sp-pill--full">At capacity</span>';
    if (startWk <= curIdx) return '<span class="sp-pill sp-pill--avail">Available now</span>';
    var lbl = (typeof cpWeekLabel === 'function') ? cpWeekLabel(startWk) : 'W' + startWk;
    var cls = startWk <= curIdx + 4 ? 'sp-pill--soon' : 'sp-pill--late';
    return '<span class="sp-pill ' + cls + '">Free ' + (typeof esc === 'function' ? esc(lbl) : lbl) + '</span>';
  }

  function _resolveSize(ideaId, idea) {
    return _pickedLead[ideaId] && _pickedLead[ideaId].size
        || _selectedSize[ideaId]
        || (idea && idea.project_size)
        || 'M';
  }

  // ── Render: route + promote buttons. Re-rendered when a lead is
  // picked so the Active/Scheduled buttons can route through the
  // confirmation modal instead of immediate promote.
  function _renderRouteButtons(ideaId, pickedName) {
    var statuses = [
      { status: 'Active',    pill: 'active'    },
      { status: 'Scheduled', pill: 'scheduled' },
      { status: 'Future',    pill: 'future'    },
      { status: 'On Hold',   pill: 'hold'      },
      { status: 'Canceled',  pill: 'canceled'  }
    ];
    var btns = statuses.map(function(s) {
      var isWorkRoute = (s.status === 'Active' || s.status === 'Scheduled');
      var armed = (pickedName && isWorkRoute) ? ' ir-route-btn--armed' : '';
      var onclick = pickedName && isWorkRoute
        ? 'spOpenPromoteModal(' + ideaId + ', \'' + s.status + '\')'
        : 'promoteIdea(' + ideaId + ', \'' + s.status + '\')';
      return '<button class="ir-route-btn' + armed + '" onclick="' + onclick + '"><span class="oe-pill oe-pill--' + s.pill + '">' + s.status + '</span></button>';
    }).join('');

    var editBtn = '<button class="oe-btn oe-btn--ghost oe-btn--sm ir-edit" onclick="openFormModal(\'edit-project\', ' + ideaId + ')"><svg class="icon" aria-hidden="true"><use href="#ph-pencil-simple"></use></svg>Edit</button>';

    var promoteBtn = '';
    if (pickedName) {
      var firstName = pickedName.split(' ')[0];
      var safeName = (typeof esc === 'function' ? esc(firstName) : firstName);
      promoteBtn = '<button class="sp-promote-btn" onclick="spOpenPromoteModal(' + ideaId + ', \'Active\')">Promote with ' + safeName + ' as lead <svg class="icon" aria-hidden="true" style="width:12px;height:12px;"><use href="#ph-arrow-right"></use></svg></button>';
    }
    return '<span class="ir-route-label">Route to</span>' + btns + editBtn + promoteBtn;
  }

  // ── Render: the staffing panel for one idea
  function renderStaffingPanel(idea) {
    if (!idea) return '';
    var ideaId   = idea.objectId;
    var category = idea.category || '';
    var size     = _resolveSize(ideaId, idea);
    var picked   = _pickedLead[ideaId] || null;
    var e = (typeof esc === 'function') ? esc : function(s) { return s; };

    var html = '<div class="sp-panel" data-sp-idea="' + ideaId + '">';

    // ── Head
    html += '<div class="sp-panel-head">';
    if (!category) {
      html += '<div><div class="sp-panel-label">Staffing</div><h3 class="sp-panel-h3">Pick a category first.</h3></div>';
      html += '</div>';
      // No-category empty state
      html += '<div class="sp-empty">';
      html += '<div class="sp-empty-icon"><svg class="icon" aria-hidden="true"><use href="#ph-tag"></use></svg></div>';
      html += '<div class="sp-empty-h">We can\'t rank candidates without a <em>category</em>.</div>';
      html += '<div class="sp-empty-sub">Fit scores come from the team\'s history in this idea\'s category. Set one and the panel populates with ranked candidates and a calibrated forecast.</div>';
      html += '<div class="sp-empty-ctrl"><span class="sp-empty-lbl">Category</span>';
      html += '<select onchange="spSetIdeaCategory(' + ideaId + ', this.value)">';
      html += '<option value="">Pick a category…</option>';
      var cats = {};
      (typeof PROJECTS !== 'undefined' ? PROJECTS : []).forEach(function(p) {
        if (p.category) cats[p.category] = true;
      });
      Object.keys(cats).sort().forEach(function(c) {
        html += '<option value="' + e(c) + '">' + e(c) + '</option>';
      });
      html += '</select></div>';
      html += '</div></div>';
      return html;
    }

    var mult    = _categoryMultiplier(category);
    var multStr = mult ? mult.value.toFixed(2) + '×' : '—';

    html += '<div><div class="sp-panel-label">Staffing</div><h3 class="sp-panel-h3">Who should lead this?</h3></div>';
    html += '<div class="sp-panel-ctx">';
    html += '<span>Category: <strong>' + e(category) + '</strong></span>';
    html += '<span>Size: <select class="sp-size-select" onchange="spSetIdeaSize(' + ideaId + ', this.value)">';
    ['S', 'M', 'L', 'XL'].forEach(function(s) {
      var label = s + ' — ' + ((typeof SIZE_DURATIONS !== 'undefined' && SIZE_DURATIONS[s]) || '?') + ' wks';
      html += '<option value="' + s + '"' + (s === size ? ' selected' : '') + '>' + label + '</option>';
    });
    html += '</select></span>';
    html += '<span>Multiplier: <strong class="oe-mono">' + multStr + '</strong>';
    if (mult) html += ' <span class="sp-mult-n">(n=' + mult.n + ')</span>';
    if (!mult) html += ' <span class="sp-mult-n">(too few completed projects)</span>';
    html += '</span>';
    html += '</div>';
    html += '</div>'; // /sp-panel-head

    // ── Body
    var ranked = rankCandidatesForIdea(idea, size);
    if (ranked.length === 0) {
      html += '<div class="sp-empty-mini">No active team members available.</div>';
    } else {
      html += '<div class="sp-panel-body">';
      ranked.forEach(function(c, i) {
        var isTop    = i === 0 && c.fit > 0;
        var isPicked = picked && picked.name === c.name;
        var rowCls   = 'sp-candidate' + (isPicked ? ' selected' : '') + (c.atCapacity ? ' dim' : '');
        var initials = c.name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
        html += '<div class="' + rowCls + '" data-sp-name="' + e(c.name) + '">';
        html += '<span class="sp-av">' + e(initials) + '</span>';

        // Identity + experience + forecast
        html += '<div class="sp-who">';
        html += '<div class="sp-name">' + e(c.name);
        if (isTop && !c.atCapacity) html += ' <span class="sp-top-flag">Top fit</span>';
        html += '</div>';
        html += '<div class="sp-role">' + e(c.role || '—') + '</div>';

        var h = c.history || {};
        var expBits = [];
        if (h.ledCount > 0) {
          expBits.push('<strong>' + h.ledCount + '</strong> led');
          if (h.onTimeRate != null) expBits.push('<strong>' + Math.round(h.onTimeRate * 100) + '%</strong> on-time');
        } else if (h.contribCount > 0) {
          expBits.push('<strong>0</strong> led · <strong>' + h.contribCount + '</strong> contributed');
        } else {
          expBits.push('<span class="sp-no-hist">No ' + e(category) + ' history</span>');
        }
        html += '<div class="sp-exp">' + expBits.join(' · ') + '</div>';
        if (h.lastDate) {
          html += '<div class="sp-recent">Last ' + e(category) + ': ' + e(h.lastDate) + '</div>';
        }

        if (c.startDate && c.endDate) {
          html += '<div class="sp-forecast">Forecast: start <strong>' + _shortDate(c.startDate) + '</strong> → finish <strong>' + _shortDate(c.endDate) + '</strong> · ' + c.calibratedWks + ' wks</div>';
        } else if (c.atCapacity) {
          html += '<div class="sp-forecast sp-forecast--warn">At capacity for the next 52 weeks</div>';
        } else {
          html += '<div class="sp-forecast sp-forecast--warn">No availability window in range</div>';
        }
        html += '</div>'; // /sp-who

        // Availability pill
        html += '<div class="sp-pill-col">' + _availabilityPill(c.earliestStart) + '</div>';

        // Fit bar
        var barColorCls = c.fit >= 60 ? 'sp-fit-bar-fill' : 'sp-fit-bar-fill sp-fit-bar-fill--mid';
        html += '<div class="sp-fit-col">';
        html += '<span class="oe-meta sp-fit-label">Fit</span>';
        html += '<div class="sp-fit-bar"><div class="' + barColorCls + '" style="width:' + Math.min(100, Math.max(0, c.fit)) + '%;"></div></div>';
        html += '<span class="sp-fit-num">' + c.fit + '</span>';
        html += '</div>';

        // Lead radio
        var radioCls = 'sp-pick-radio' + (isPicked ? ' checked' : '');
        var safeName = e(c.name).replace(/'/g, "\\'");
        html += '<label class="' + radioCls + '" onclick="spPickLead(event, ' + ideaId + ', \'' + safeName + '\', \'' + size + '\')"><span class="sp-circle"></span>Lead</label>';
        html += '</div>';
      });
      html += '</div>'; // /sp-panel-body
    }

    // ── Foot
    html += '<div class="sp-panel-foot">';
    html += '<span>Fit = 40% on-time × 40% completed × 20% recency';
    if (mult) html += ' · multiplier from <strong>' + mult.n + '</strong> ' + e(category) + ' completion' + (mult.n === 1 ? '' : 's');
    html += '</span>';
    html += '</div>';

    html += '</div>'; // /sp-panel
    return html;
  }

  // ── Setters: category / size
  function setIdeaCategory(ideaId, category) {
    if (!category) return;
    var p = (typeof PROJECTS !== 'undefined') ? PROJECTS.find(function(x) { return x.objectId == ideaId; }) : null;
    if (!p) return;
    p.category = category;
    if (typeof DataStore !== 'undefined' && DataStore.updateProject) {
      DataStore.updateProject(ideaId, { category: category }).catch(function(err) {
        console.warn('[Staffing] category update failed:', err);
      });
    }
    // Full re-render so the panel populates from scratch.
    if (typeof render === 'function') render();
  }

  function setIdeaSize(ideaId, size) {
    _selectedSize[ideaId] = size;
    if (_pickedLead[ideaId]) _pickedLead[ideaId].size = size;
    var p = (typeof PROJECTS !== 'undefined') ? PROJECTS.find(function(x) { return x.objectId == ideaId; }) : null;
    if (!p) return;
    var node = document.querySelector('[data-sp-idea="' + ideaId + '"]');
    if (!node) return;
    var fresh = renderStaffingPanel(p);
    node.outerHTML = fresh;
    // Route buttons might display the picked-lead promote button — refresh them.
    var route = document.getElementById('sp-route-' + ideaId);
    if (route) route.innerHTML = _renderRouteButtons(ideaId, _pickedLead[ideaId] ? _pickedLead[ideaId].name : null);
  }

  // ── Pick lead (click anywhere on the radio label)
  function pickLead(ev, ideaId, name, size) {
    if (ev) ev.preventDefault();
    var cur = _pickedLead[ideaId];
    if (cur && cur.name === name) {
      delete _pickedLead[ideaId];
    } else {
      _pickedLead[ideaId] = { name: name, size: size };
    }
    var picked = _pickedLead[ideaId] || null;

    // Update each row's selected/checked state in place — avoids a
    // full panel re-render so the user's scroll / focus is preserved.
    document.querySelectorAll('[data-sp-idea="' + ideaId + '"] .sp-candidate').forEach(function(row) {
      var rowName = row.getAttribute('data-sp-name');
      var radio = row.querySelector('.sp-pick-radio');
      var isPicked = picked && rowName === picked.name;
      row.classList.toggle('selected', !!isPicked);
      if (radio) radio.classList.toggle('checked', !!isPicked);
    });
    // Re-render route + promote buttons to reflect armed state.
    var route = document.getElementById('sp-route-' + ideaId);
    if (route) route.innerHTML = _renderRouteButtons(ideaId, picked ? picked.name : null);
  }

  // ── Promote modal
  function openPromoteModal(ideaId, status) {
    var p = (typeof PROJECTS !== 'undefined') ? PROJECTS.find(function(x) { return x.objectId == ideaId; }) : null;
    if (!p) return;
    var picked = _pickedLead[ideaId];
    if (!picked || !picked.name) {
      // No lead picked — fall back to the existing direct-promote flow.
      if (typeof promoteIdea === 'function') promoteIdea(ideaId, status);
      return;
    }
    var size = picked.size || p.project_size || 'M';
    var candidates = rankCandidatesForIdea(p, size);
    var chosen = candidates.find(function(c) { return c.name === picked.name; });
    if (!chosen) {
      if (typeof promoteIdea === 'function') promoteIdea(ideaId, status);
      return;
    }
    var mult    = chosen.multiplier;
    var multStr = mult ? mult.value.toFixed(2) + '×' : '—';
    var allocPct = ((typeof _allocationDefaults !== 'undefined' ? _allocationDefaults[size] : null) || {}).Lead || 0;
    var pillCls = status === 'Active' ? 'active' : 'scheduled';
    var e = (typeof esc === 'function') ? esc : function(s) { return s; };

    var backdrop = document.getElementById('sp-promote-modal');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'sp-promote-modal';
      backdrop.className = 'sp-modal-backdrop';
      backdrop.addEventListener('click', function(ev) {
        if (ev.target === backdrop) closeModal();
      });
      document.body.appendChild(backdrop);
    }

    backdrop.innerHTML =
      '<div class="sp-modal">' +
        '<div class="sp-modal-head">' +
          '<div class="sp-modal-l">Promote idea</div>' +
          '<h2>' + e(p.title) + '</h2>' +
        '</div>' +
        '<div class="sp-modal-body">' +
          '<div class="sp-transition">' +
            '<span class="oe-pill oe-pill--idea">Idea</span>' +
            '<svg class="icon sp-arrow" aria-hidden="true"><use href="#ph-arrow-right"></use></svg>' +
            '<span class="oe-pill oe-pill--' + pillCls + '">' + status + '</span>' +
            '<span class="sp-modal-meta">Allocations will be created at <strong>' + allocPct + '%</strong> for the lead.</span>' +
          '</div>' +
          '<div class="sp-summary">' +
            '<div><div class="sp-sum-l">Lead</div><div class="sp-sum-v">' + e(chosen.name) +
              '<small>fit ' + chosen.fit + ' · ' + ((chosen.history && chosen.history.ledCount) || 0) + ' ' + e(p.category || '') + ' led</small></div></div>' +
            '<div><div class="sp-sum-l">Category / size</div><div class="sp-sum-v">' + e(p.category || '') + ' · ' + size +
              '<small>' + allocPct + '% project time / week</small></div></div>' +
            '<div><div class="sp-sum-l">Working start</div><div class="sp-sum-v">' + _shortDate(chosen.startDate) +
              '<small>' + (chosen.startDate || '—') + '</small></div></div>' +
            '<div><div class="sp-sum-l">Calibrated finish</div><div class="sp-sum-v">' + _shortDate(chosen.endDate) +
              '<small>' + chosen.calibratedWks + ' wks · ' + chosen.plannedWks + ' plan × ' + multStr + ' multiplier</small></div></div>' +
          '</div>' +
          '<div class="sp-form-row">' +
            '<label class="sp-form-l">Confirm end date (you can override)</label>' +
            '<input type="date" id="sp-modal-enddate" value="' + (chosen.endDate || '') + '">' +
          '</div>' +
          '<div class="sp-form-row">' +
            '<label class="sp-form-l">Note to the project journal (optional)</label>' +
            '<textarea id="sp-modal-note" class="sp-modal-textarea" placeholder="One-line context for the staffing call — saved alongside the [Staffing] entry"></textarea>' +
          '</div>' +
        '</div>' +
        '<div class="sp-modal-foot">' +
          '<button class="sp-btn sp-btn-ghost" onclick="spCloseModal()">Cancel</button>' +
          '<button class="sp-btn sp-btn-primary" onclick="spConfirmPromote(' + ideaId + ', \'' + status + '\')">Confirm promotion <svg class="icon" aria-hidden="true" style="width:12px;height:12px;"><use href="#ph-check"></use></svg></button>' +
        '</div>' +
      '</div>';
    backdrop.style.display = 'flex';
  }

  function closeModal() {
    var modal = document.getElementById('sp-promote-modal');
    if (modal) modal.style.display = 'none';
  }

  // ── Confirm promote — runs the update + journal write
  async function confirmPromote(ideaId, status) {
    var p = (typeof PROJECTS !== 'undefined') ? PROJECTS.find(function(x) { return x.objectId == ideaId; }) : null;
    if (!p) { closeModal(); return; }
    var picked = _pickedLead[ideaId];
    if (!picked || !picked.name) { closeModal(); return; }

    var endDateEl = document.getElementById('sp-modal-enddate');
    var noteEl    = document.getElementById('sp-modal-note');
    var endDate   = endDateEl ? endDateEl.value : '';
    var userNote  = noteEl ? noteEl.value.trim() : '';
    var size      = picked.size || p.project_size || 'M';

    var candidates = rankCandidatesForIdea(p, size);
    var chosen     = candidates.find(function(c) { return c.name === picked.name; });
    var mult       = chosen && chosen.multiplier;
    var multStr    = mult ? mult.value.toFixed(2) + '×' : '—';
    var multN      = mult ? mult.n : 0;
    var h          = (chosen && chosen.history) || {};
    var onTimePct  = h.onTimeRate != null ? Math.round(h.onTimeRate * 100) + '%' : '—';
    var ledCount   = h.ledCount || 0;
    var lastDate   = h.lastDate || '—';

    closeModal();

    var updates = {
      status:       status,
      contact:      picked.name,
      project_size: size
    };
    if (chosen && chosen.startDate) updates.start = chosen.startDate;
    if (endDate) updates.end = endDate;

    try {
      await DataStore.updateProject(ideaId, updates);

      // Reflect locally so re-render shows the new state.
      p.status       = status;
      p.contact      = picked.name;
      p.project_size = size;
      if (chosen && chosen.startDate) p.start = chosen.startDate;
      if (endDate) p.end = endDate;

      // [Staffing] journal entry — text-prefix convention so we can
      // detect "staffing recorded" later without a schema change.
      var noteText =
        '[Staffing] Lead set to ' + picked.name +
        ' at promotion (Idea → ' + status + '). ' +
        'Fit ' + (chosen ? chosen.fit : '?') +
        ' · ' + ledCount + ' ' + (p.category || '—') + ' led' +
        ' · on-time ' + onTimePct +
        ' · last ' + lastDate +
        ' · calibrated ' + multStr + ' (n=' + multN + ')';
      if (userNote) noteText += '\n\n' + userNote;

      if (typeof addProjectNote === 'function' && p.project_number) {
        try { await addProjectNote(p.project_number, noteText); }
        catch (e) { console.warn('[Staffing] journal note failed:', e); }
      }

      delete _pickedLead[ideaId];
      delete _selectedSize[ideaId];

      if (typeof markDirty === 'function') markDirty();
      if (typeof markDataDirty === 'function') markDataDirty();
      if (typeof showToast === 'function') {
        showToast('Promoted "' + p.title + '" to ' + status + ' with ' + picked.name + ' as lead.', 'success');
      }

      if (typeof render === 'function') render();
      else if (typeof renderIdeaReviewOE === 'function') {
        var area = document.getElementById('content-area');
        if (area) area.innerHTML = renderIdeaReviewOE();
      }
    } catch (err) {
      console.error('[Staffing] promote failed:', err);
      if (typeof showToast === 'function') showToast('Failed to promote. See console.', 'warn');
    }
  }

  // ── Public surface (window-scoped so onclick handlers can reach them)
  window.spRenderStaffingPanel = renderStaffingPanel;
  window.spRenderRouteButtons  = _renderRouteButtons;
  window.spGetPickedLead       = function(ideaId) { return _pickedLead[ideaId] || null; };
  window.spPickLead            = pickLead;
  window.spOpenPromoteModal    = openPromoteModal;
  window.spCloseModal          = closeModal;
  window.spConfirmPromote      = confirmPromote;
  window.spSetIdeaCategory     = setIdeaCategory;
  window.spSetIdeaSize         = setIdeaSize;
  // Reset module state when the page leaves Idea Review (called by render).
  window.spResetState          = function() { _pickedLead = {}; _selectedSize = {}; };
})();
