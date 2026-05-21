// ─────────────────────────────────────────────────────────────────────
// modals/forms.js — Project / Task forms + wizards + form helpers
//
// The biggest modal cluster. Owns:
//   - Wizards: Task Category, Tool, Project Category, Project Size
//   - Form helpers: fmSelect, fmInput, fmTextarea, fmMdTextarea (with
//     md-insert and char-counter), fmCheckboxGroup, fmDeliverables,
//     fmField, fmCategoryField, fmTaskCategoryField, fmSearchableSelect
//     (+ initSearchableSelect), fmMemberMultiSelect, fmRoleChange,
//     fmToggleMember, fmMemberCbChanged, renderTeamAvailList, fmSec,
//     fmWwcCriteriaGrouped, fmProjectSizeField, fmTaskToolField
//   - Phase-requirement selector helpers (buildPhaseReqSelector,
//     togglePhaseReqDropdown, renderPhaseReqDropdown, togglePhaseReq,
//     removePhaseReq)
//   - Strategic Alignment AI suggestion (suggestAlignment,
//     renderAlignmentSuggestions, applyAlignmentSuggestions). Kept
//     here because it's invoked from the project form and tightly
//     coupled with it; can move to ai/* later if desired.
//   - Form builders (buildProjectForm, buildTaskForm)
//   - Form modal lifecycle (openFormModal, closeFormModal, getVal,
//     collectProjectFields, collectTaskFields, handleFormSubmit,
//     handleFormDelete)
//
// Forward references: many — Auth, Editor, ensureValidSession,
// markDataDirty, render, refreshEnums, isFeatureOn, AI_PROXY_URL,
// PROJECTS, TASKS, RESOURCES_DATA, getEnums, FM_*, STRATEGIC_*,
// LIFECYCLE_PHASES, DataStore, agolApplyEdits, ARCGIS_CONFIG,
// showToast, esc, escapeAttr, ensureProjectContributor, etc.
// ─────────────────────────────────────────────────────────────────────

// ── Wizards + form helpers + builders + handlers ──────────
// ── Task Category Wizard ──────────────────────────────────────────────
// Three-question guided walkthrough to help users pick the right task category.
const TASK_CAT_WIZARD_TREE = {
  q1: {
    question: 'What best describes the type of work you\'re doing?',
    options: [
      { label: 'Building or creating something new', next: 'q2_build' },
      { label: 'Working with data', next: 'q2_data' },
      { label: 'Maintaining, fixing, or deploying', next: 'q2_ops' },
      { label: 'Planning, learning, or communicating', next: 'q2_plan' },
      { label: 'None of these fit my task', category: 'Other' },
    ]
  },
  q2_build: {
    question: 'What are you building?',
    options: [
      { label: 'A new application, dashboard, or web tool', category: 'Application Development' },
      { label: 'An AI model, ML pipeline, or intelligent workflow', category: 'AI & Machine Learning' },
      { label: 'A script, automation, or scheduled process', category: 'Automation & Scripting' },
      { label: 'A map, spatial analysis, or GIS product', category: 'Geospatial Analysis' },
      { label: 'A report, dashboard, or data visualization', category: 'Data Visualization & Reporting' },
      { label: 'A proof of concept or prototype', category: 'Research & Prototyping' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q2_data: {
    question: 'What kind of data work?',
    options: [
      { label: 'Exploring or profiling a new data source', category: 'Data Discovery & Profiling' },
      { label: 'Building or modifying a data pipeline or ETL', category: 'Data Engineering' },
      { label: 'Routine data updates, corrections, or cleanup', category: 'Data Maintenance' },
      { label: 'Statistical modeling or quantitative analysis', category: 'Statistical Analysis' },
      { label: 'Validating data quality or reviewing work', category: 'Code Review & QA' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q2_ops: {
    question: 'What kind of operations work?',
    options: [
      { label: 'Updating or fixing an existing application', category: 'Application Maintenance' },
      { label: 'Debugging or diagnosing an issue', category: 'Troubleshooting' },
      { label: 'Publishing, deploying, or releasing to production', category: 'Deployment & Release' },
      { label: 'Server builds, software installs, or platform admin', category: 'Infrastructure & Server Management' },
      { label: 'Security, access management, or compliance', category: 'Security & Compliance' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q2_plan: {
    question: 'What best describes the activity?',
    options: [
      { label: 'Requirements, scoping, or project planning', category: 'Project Planning & Scoping' },
      { label: 'Writing documentation, SOPs, or policies', category: 'Documentation' },
      { label: 'Attending or running a meeting', category: 'Meeting & Collaboration' },
      { label: 'Training I\'m taking (courses, certifications)', category: 'Professional Development' },
      { label: 'Training others or creating training materials', category: 'User Training & Enablement' },
      { label: 'Helping a user or answering a support request', category: 'Stakeholder Support' },
      { label: 'Researching tools, techniques, or approaches', category: 'Research & Prototyping' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
};


function taskCatWizardOpen() {
  const container = document.getElementById('fm-task-category-content');
  if (!container) return;
  Internal.taskCatWizardHTML = container.innerHTML;
  taskCatWizardRenderStep('q1');
}

function taskCatWizardClose() {
  const container = document.getElementById('fm-task-category-content');
  if (!container || !Internal.taskCatWizardHTML) return;
  container.innerHTML = Internal.taskCatWizardHTML;
  Internal.taskCatWizardHTML = '';
  initSearchableSelect('fm-category');
}

function taskCatWizardRenderStep(stepId) {
  const container = document.getElementById('fm-task-category-content');
  if (!container) return;
  const step = TASK_CAT_WIZARD_TREE[stepId];
  if (!step) return;
  const isQ2 = stepId !== 'q1';
  let html = '<div class="cat-wizard-panel open">';
  html += '<div class="cat-wizard-q">' + (isQ2 ? 'Step 2 of 2: ' : 'Step 1 of 2: ') + esc(step.question) + '</div>';
  html += '<div class="cat-wizard-opts">';
  step.options.forEach(function(opt) {
    if (opt.next) {
      html += '<button type="button" class="cat-wizard-opt" onclick="taskCatWizardRenderStep(\'' + opt.next + '\')">' + esc(opt.label) + '</button>';
    } else if (opt.category) {
      html += '<button type="button" class="cat-wizard-opt" onclick="taskCatWizardShowResult(\'' + esc(opt.category).replace(/'/g, "\\'") + '\')">' + esc(opt.label) + '</button>';
    }
  });
  html += '</div>';
  html += '<div style="margin-top:8px;">';
  if (isQ2) {
    html += '<button type="button" class="cat-wizard-back" onclick="taskCatWizardRenderStep(\'q1\')">← Back</button>';
  }
  html += ' <button type="button" class="cat-wizard-back" onclick="taskCatWizardClose()">Cancel</button>';
  html += '</div></div>';
  container.innerHTML = html;
}

function taskCatWizardShowResult(categoryName) {
  const container = document.getElementById('fm-task-category-content');
  if (!container) return;
  const desc = TASK_CATEGORY_DESCRIPTIONS[categoryName] || '';
  let html = '<div class="cat-wizard-panel open">';
  html += '<div class="cat-wizard-result">' +
    '<div class="cat-wizard-result-label">✓ Recommended Category</div>' +
    '<div class="cat-wizard-result-name">' + esc(categoryName) + '</div>' +
    (desc ? '<div class="cat-wizard-result-desc">' + esc(desc) + '</div>' : '') +
    '<button type="button" class="cat-wizard-result-btn" onclick="taskCatWizardApply(\'' + esc(categoryName).replace(/'/g, "\\'") + '\')">Use This Category</button>' +
  '</div>';
  html += '<div style="margin-top:8px;">';
  html += '<button type="button" class="cat-wizard-back" onclick="taskCatWizardRenderStep(\'q1\')">← Start over</button>';
  html += ' <button type="button" class="cat-wizard-back" onclick="taskCatWizardClose()">Cancel</button>';
  html += '</div></div>';
  container.innerHTML = html;
}

function taskCatWizardApply(categoryName) {
  taskCatWizardClose();
  const input = document.getElementById('fm-category');
  const hidden = document.getElementById('fm-category-val');
  if (input) input.value = categoryName;
  if (hidden) hidden.value = categoryName;
}

// ── Task Tool Descriptions ──────────────────────────────────────
let TASK_TOOL_DESCRIPTIONS = {};

// ── Task Tool Wizard ──────────────────────────────────────────────
const TASK_TOOL_WIZARD_TREE = {
  q1: {
    question: 'What type of tool are you primarily using?',
    options: [
      { label: 'A GIS or mapping tool', next: 'q2_gis' },
      { label: 'A data or analytics tool', next: 'q2_data' },
      { label: 'A coding or development tool', next: 'q2_dev' },
      { label: 'A Microsoft Office or collaboration tool', next: 'q2_office' },
      { label: 'An automation or integration tool', next: 'q2_auto' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q2_gis: {
    question: 'Which GIS tool?',
    options: [
      { label: 'Building a web map or managing data online', category: 'ArcGIS Online' },
      { label: 'Desktop analysis, editing, or cartography', category: 'ArcGIS Pro' },
      { label: 'A web app (Experience Builder, Hub, Instant Apps)', next: 'q3_webapp' },
      { label: 'A dashboard for real-time monitoring', category: 'ArcGIS Dashboard' },
      { label: 'Data collection with forms or field work', next: 'q3_collect' },
      { label: 'A narrative or story-driven app', category: 'ArcGIS StoryMap' },
      { label: 'Server administration or enterprise services', next: 'q3_server' },
      { label: 'Legacy ArcMap / ArcGIS Desktop', category: 'ArcMap (Desktop)' },
      { label: 'Geocortex / VertiGIS application', category: 'Geocortex / VertiGIS' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q3_webapp: {
    question: 'Which type of web app?',
    options: [
      { label: 'ArcGIS Experience Builder (custom layout)', category: 'ArcGIS Experience Builder' },
      { label: 'ArcGIS Hub Site (community/public site)', category: 'ArcGIS Hub Site' },
      { label: 'ArcGIS Instant Apps (quick template-based)', category: 'ArcGIS Instant Apps' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q3_collect: {
    question: 'What kind of data collection?',
    options: [
      { label: 'Form-based surveys (Survey123)', category: 'ArcGIS Survey123' },
      { label: 'Field data collection or workforce tasks', category: 'ArcGIS Field Maps' },
      { label: 'A simple web form (Microsoft Forms)', category: 'Microsoft Forms' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q3_server: {
    question: 'Which server/enterprise platform?',
    options: [
      { label: 'ArcGIS Enterprise (portal & services)', category: 'ArcGIS Enterprise' },
      { label: 'ArcGIS Server (map/feature/GP services)', category: 'ArcGIS Server' },
      { label: 'Azure or other cloud platform', category: 'Azure / Cloud Services' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q2_data: {
    question: 'What kind of data work?',
    options: [
      { label: 'Building dashboards or reports (Power BI)', category: 'Power BI' },
      { label: 'Querying databases with SQL', category: 'SQL (Various Tools)' },
      { label: 'Data warehouse (Snowflake)', category: 'Snowflake' },
      { label: 'Data integration (TimeXtender)', category: 'TimeXtender' },
      { label: 'Data transformation (FME)', category: 'FME' },
      { label: 'Data catalog (Alation)', category: 'Alation' },
      { label: 'Analytics platform (Qlik)', category: 'Qlik' },
      { label: 'Spreadsheet analysis (Excel)', category: 'Excel' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q2_dev: {
    question: 'What kind of development?',
    options: [
      { label: 'Python scripting or programming', category: 'Python' },
      { label: 'GIS automation with arcpy or ArcGIS Python API', category: 'ArcGIS Python API (arcpy/arcgis)' },
      { label: 'PowerShell scripting or system admin', category: 'PowerShell' },
      { label: 'Version control with Git / GitHub', category: 'Git / GitHub' },
      { label: 'Interactive notebooks (Jupyter)', category: 'Jupyter / Notebooks' },
      { label: 'Containers (Docker)', category: 'Docker' },
      { label: 'AI assistant (ChatGPT, Claude, Copilot)', category: 'AI Assistant (ChatGPT/Claude/Copilot)' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q2_office: {
    question: 'Which tool?',
    options: [
      { label: 'Excel (spreadsheets)', category: 'Excel' },
      { label: 'Word (documents)', category: 'Word' },
      { label: 'PowerPoint (presentations)', category: 'PowerPoint' },
      { label: 'SharePoint (document management)', category: 'SharePoint' },
      { label: 'Microsoft Teams (collaboration)', category: 'Microsoft Teams' },
      { label: 'Microsoft Forms (surveys)', category: 'Microsoft Forms' },
      { label: 'Smartsheet (work management)', category: 'Smartsheet' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q2_auto: {
    question: 'What kind of automation?',
    options: [
      { label: 'Power Automate workflows', category: 'Power Automate' },
      { label: 'FME spatial ETL', category: 'FME' },
      { label: 'Python scripting', category: 'Python' },
      { label: 'PowerShell scripting', category: 'PowerShell' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
};


function toolWizardOpen() {
  const container = document.getElementById('fm-tool-content');
  if (!container) return;
  Internal.toolWizardHTML = container.innerHTML;
  toolWizardRenderStep('q1');
}

function toolWizardClose() {
  const container = document.getElementById('fm-tool-content');
  if (!container || !Internal.toolWizardHTML) return;
  container.innerHTML = Internal.toolWizardHTML;
  Internal.toolWizardHTML = '';
  initSearchableSelect('fm-tool');
}

function toolWizardRenderStep(stepId) {
  const container = document.getElementById('fm-tool-content');
  if (!container) return;
  const step = TASK_TOOL_WIZARD_TREE[stepId];
  if (!step) return;
  const stepNum = stepId === 'q1' ? 1 : stepId.startsWith('q3') ? 3 : 2;
  const totalSteps = stepId.startsWith('q3') ? 3 : stepId === 'q1' ? 2 : 2;
  let html = '<div class="cat-wizard-panel open">';
  html += '<div class="cat-wizard-q">Step ' + stepNum + ': ' + esc(step.question) + '</div>';
  html += '<div class="cat-wizard-opts">';
  step.options.forEach(function(opt) {
    if (opt.next) {
      html += '<button type="button" class="cat-wizard-opt" onclick="toolWizardRenderStep(\'' + opt.next + '\')">' + esc(opt.label) + '</button>';
    } else if (opt.category) {
      html += '<button type="button" class="cat-wizard-opt" onclick="toolWizardShowResult(\'' + esc(opt.category).replace(/'/g, "\\'") + '\')">' + esc(opt.label) + '</button>';
    }
  });
  html += '</div>';
  html += '<div style="margin-top:8px;">';
  if (stepId !== 'q1') {
    // Find parent step to go back to
    const backStep = stepId.startsWith('q3') ? Object.keys(TASK_TOOL_WIZARD_TREE).find(function(k) {
      return TASK_TOOL_WIZARD_TREE[k].options && TASK_TOOL_WIZARD_TREE[k].options.some(function(o) { return o.next === stepId; });
    }) || 'q1' : 'q1';
    html += '<button type="button" class="cat-wizard-back" onclick="toolWizardRenderStep(\'' + backStep + '\')">← Back</button>';
  }
  html += ' <button type="button" class="cat-wizard-back" onclick="toolWizardClose()">Cancel</button>';
  html += '</div></div>';
  container.innerHTML = html;
}

function toolWizardShowResult(toolName) {
  const container = document.getElementById('fm-tool-content');
  if (!container) return;
  const desc = TASK_TOOL_DESCRIPTIONS[toolName] || '';
  let html = '<div class="cat-wizard-panel open">';
  html += '<div class="cat-wizard-result">' +
    '<div class="cat-wizard-result-label">✓ Recommended Tool</div>' +
    '<div class="cat-wizard-result-name">' + esc(toolName) + '</div>' +
    (desc ? '<div class="cat-wizard-result-desc">' + esc(desc) + '</div>' : '') +
    '<button type="button" class="cat-wizard-result-btn" onclick="toolWizardApply(\'' + esc(toolName).replace(/'/g, "\\'") + '\')">Use This Tool</button>' +
  '</div>';
  html += '<div style="margin-top:8px;">';
  html += '<button type="button" class="cat-wizard-back" onclick="toolWizardRenderStep(\'q1\')">← Start over</button>';
  html += ' <button type="button" class="cat-wizard-back" onclick="toolWizardClose()">Cancel</button>';
  html += '</div></div>';
  container.innerHTML = html;
}

function toolWizardApply(toolName) {
  toolWizardClose();
  const input = document.getElementById('fm-tool');
  const hidden = document.getElementById('fm-tool-val');
  if (input) input.value = toolName;
  if (hidden) hidden.value = toolName;
}

function fmTaskToolField(currentValue, span2) {
  const cls = 'fm-field' + (span2 ? ' span2' : '');
  // Use active tools only; include current value even if retired so user can see/change it
  let toolList = FM_TASK_TOOLS_ACTIVE || FM_TASK_TOOLS || [];
  const descMap = Object.assign({}, TASK_TOOL_DESCRIPTIONS);
  if (currentValue && !toolList.includes(currentValue)) {
    toolList = [currentValue].concat(toolList);
    // Add retired note to description so it's visible in the dropdown
    descMap[currentValue] = (descMap[currentValue] || '') + ' (RETIRED — no longer available for new tasks)';
  }
  return '<div class="' + cls + '" id="fm-tool-field">' +
    '<label class="fm-label">' +
      'Tool / Technology ' +
      '<a href="javascript:void(0)" class="cat-wizard-link" onclick="toolWizardOpen()">' +
        '✨ Help me choose' +
      '</a>' +
    '</label>' +
    '<div id="fm-tool-content">' +
      fmSearchableSelect('fm-tool', toolList, currentValue, 'Type to search tools…', descMap) +
    '</div>' +
  '</div>';
}

function fmSelect(id, options, value, placeholder, required) {
  const req = required ? ' class="fm-select err" ' : ' class="fm-select" ';
  // Ensure the current value is always available even if not in the options list
  // (e.g. an old category that was renamed, or a value from an older data upload)
  const opts = (value && !options.includes(value)) ? [...options, value] : options;
  let html = '<select id="' + id + '"' + req + '>';
  if (placeholder) html += '<option value="">' + placeholder + '</option>';
  opts.forEach(function(o) {
    html += '<option value="' + o + '"' + (o === value ? ' selected' : '') + '>' + o + '</option>';
  });
  return html + '</select>';
}

function fmInput(id, value, placeholder, type) {
  type = type || 'text';
  return '<input id="' + id + '" type="' + type + '" class="fm-input" value="' +
    (value ? esc(value) : '') + '" placeholder="' + (placeholder||'') + '">';
}

function fmTextarea(id, value, placeholder, rows) {
  rows = rows || 3;
  return '<textarea id="' + id + '" class="fm-textarea" rows="' + rows + '" placeholder="' +
    (placeholder||'') + '">' + (value ? esc(value) : '') + '</textarea>';
}

function fmMdTextarea(id, value, placeholder, rows, maxLen) {
  rows = rows || 3;
  maxLen = maxLen || 0;
  var curLen = (value || '').length;
  var counterHtml = maxLen > 0 ? '<span class="md-counter" id="counter-' + id + '" data-max="' + maxLen + '">' + curLen.toLocaleString() + ' / ' + maxLen.toLocaleString() + '</span>' : '';
  return '<div class="md-editor-wrap" id="wrap-' + id + '">' +
    '<div class="md-toolbar">' +
      '<button type="button" onclick="mdInsert(\'' + id + '\',\'bold\')" title="Bold" class="md-tb-btn" style="font-weight:700;">B</button>' +
      '<button type="button" onclick="mdInsert(\'' + id + '\',\'italic\')" title="Italic" class="md-tb-btn" style="font-style:italic;">I</button>' +
      '<span class="md-tb-sep"></span>' +
      '<button type="button" onclick="mdInsert(\'' + id + '\',\'heading\')" title="Heading" class="md-tb-btn">H</button>' +
      '<button type="button" onclick="mdInsert(\'' + id + '\',\'ul\')" title="Bullet list" class="md-tb-btn">\u2022 List</button>' +
      '<button type="button" onclick="mdInsert(\'' + id + '\',\'ol\')" title="Numbered list" class="md-tb-btn">1. List</button>' +
      '<span class="md-tb-sep"></span>' +
      '<button type="button" onclick="mdInsert(\'' + id + '\',\'code\')" title="Code" class="md-tb-btn" style="font-family:monospace;">&lt;/&gt;</button>' +
      '<button type="button" onclick="mdInsert(\'' + id + '\',\'link\')" title="Link" class="md-tb-btn">Link</button>' +
    '</div>' +
    '<textarea id="' + id + '" class="fm-textarea md-textarea" rows="' + rows + '" placeholder="' +
      (placeholder||'') + '"' + (maxLen > 0 ? ' oninput="mdUpdateCounter(\'' + id + '\')"' : '') + '>' + (value ? esc(value) : '') + '</textarea>' +
    '<div class="md-footer">' +
      '<span class="md-hint">Supports markdown: **bold**, *italic*, ## heading, - bullet list, 1. numbered list, `code`, [link](url)</span>' +
      counterHtml +
    '</div>' +
  '</div>';
}

function mdInsert(textareaId, action) {
  var ta = document.getElementById(textareaId);
  if (!ta) return;
  var start = ta.selectionStart;
  var end = ta.selectionEnd;
  var text = ta.value;
  var sel = text.substring(start, end);
  var before = text.substring(0, start);
  var after = text.substring(end);
  var insert = '';
  var cursorOffset = 0;

  switch(action) {
    case 'bold':
      insert = '**' + (sel || 'bold text') + '**';
      cursorOffset = sel ? insert.length : 2;
      break;
    case 'italic':
      insert = '*' + (sel || 'italic text') + '*';
      cursorOffset = sel ? insert.length : 1;
      break;
    case 'heading':
      var lineStart = before.lastIndexOf('\n') + 1;
      var prefix = before.substring(lineStart);
      if (prefix.startsWith('## ')) {
        before = before.substring(0, lineStart) + prefix.substring(3);
        insert = sel;
        cursorOffset = (sel || '').length;
      } else {
        var needNewline = before.length > 0 && !before.endsWith('\n') && lineStart === before.length ? '\n' : '';
        before = before.substring(0, lineStart);
        insert = needNewline + '## ' + prefix + sel;
        cursorOffset = insert.length;
      }
      break;
    case 'ul':
      if (sel) {
        insert = sel.split('\n').map(function(l) { return '- ' + l; }).join('\n');
      } else {
        var nlPre = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
        insert = nlPre + '- ';
      }
      cursorOffset = insert.length;
      break;
    case 'ol':
      if (sel) {
        insert = sel.split('\n').map(function(l, i) { return (i+1) + '. ' + l; }).join('\n');
      } else {
        var nlPre2 = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
        insert = nlPre2 + '1. ';
      }
      cursorOffset = insert.length;
      break;
    case 'code':
      insert = '`' + (sel || 'code') + '`';
      cursorOffset = sel ? insert.length : 1;
      break;
    case 'link':
      if (sel) {
        insert = '[' + sel + '](url)';
        cursorOffset = insert.length - 4;
      } else {
        insert = '[link text](url)';
        cursorOffset = 1;
      }
      break;
  }

  ta.value = before + insert + after;
  ta.focus();
  var newPos = before.length + cursorOffset;
  if (!sel && (action === 'bold' || action === 'italic' || action === 'code')) {
    ta.selectionStart = before.length + (action === 'bold' ? 2 : 1);
    ta.selectionEnd = before.length + insert.length - (action === 'bold' ? 2 : 1);
  } else if (!sel && action === 'link') {
    ta.selectionStart = before.length + 1;
    ta.selectionEnd = before.length + 10;
  } else {
    ta.selectionStart = ta.selectionEnd = newPos;
  }
  mdUpdateCounter(textareaId);
}

function mdUpdateCounter(textareaId) {
  var ta = document.getElementById(textareaId);
  var counter = document.getElementById('counter-' + textareaId);
  var wrap = document.getElementById('wrap-' + textareaId);
  if (!ta || !counter) return;
  var max = parseInt(counter.dataset.max) || 0;
  if (!max) return;
  var len = ta.value.length;
  counter.textContent = len.toLocaleString() + ' / ' + max.toLocaleString();
  if (len > max) {
    counter.style.color = '#EF4444';
    if (wrap) wrap.classList.add('md-over-limit');
  } else if (len > max * 0.9) {
    counter.style.color = '#F59E0B';
    if (wrap) wrap.classList.remove('md-over-limit');
  } else {
    counter.style.color = '#9CA3AF';
    if (wrap) wrap.classList.remove('md-over-limit');
  }
}

function fmCheckCharLimits() {
  var counters = document.querySelectorAll('.md-counter');
  var overLimit = [];
  counters.forEach(function(el) {
    var max = parseInt(el.dataset.max) || 0;
    var textareaId = el.id.replace('counter-', '');
    var ta = document.getElementById(textareaId);
    if (ta && max && ta.value.length > max) {
      var label = ta.closest('.fm-field');
      var fieldName = label ? (label.querySelector('.fm-label') || {}).textContent || textareaId : textareaId;
      overLimit.push(fieldName.trim() + ' (' + ta.value.length.toLocaleString() + '/' + max.toLocaleString() + ')');
    }
  });
  // Also check title
  var titleEl = document.getElementById('fm-title-val');
  if (titleEl && titleEl.value.length > 500) {
    overLimit.push('Title (' + titleEl.value.length + '/500)');
  }
  return overLimit;
}

function fmCheckboxGroup(name, options, currentVal, disabled) {
  var selected = (currentVal || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var disabledAttr = disabled ? ' disabled' : '';
  var wrapStyle = disabled ? ' style="opacity:0.6;pointer-events:none;"' : '';
  var html = '<div class="fm-deliverables-grid" id="' + name + '-wrap"' + wrapStyle + '>';
  options.forEach(function(opt) {
    var checked = selected.includes(opt) ? ' checked' : '';
    html += '<label class="fm-deliv-check"><input type="checkbox" name="' + name + '" value="' + esc(opt) + '"' + checked + disabledAttr + '>' + esc(opt) + '</label>';
  });
  html += '</div>';
  return html;
}

function collectCheckboxGroup(name) {
  var boxes = document.querySelectorAll('input[name="' + name + '"]:checked');
  return [...boxes].map(function(cb) { return cb.value; }).join(', ') || null;
}

function fmField(label, inputHtml, required, span2, hint) {
  const cls = 'fm-field' + (span2 ? ' span2' : '');
  const req  = required ? '<span class="req">*</span>' : '';
  const info = hint ? fmInfoIcon(hint) : '';
  return '<div class="' + cls + '"><label class="fm-label">' + label + req + info + '</label>' + inputHtml + '</div>';
}

// Inline "i" icon that, on click, shows the field's hint text in a popup.
// Reuses the .calc-info visual style. Hint text travels via a data attribute
// so arbitrary strings (quotes, ampersands, etc.) don't have to be escaped
// into the onclick handler.
function fmInfoIcon(text) {
  var safe = String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return ' <span class="calc-info" onclick="showFmHint(event)" data-hint="' + safe + '" title="Click for details">i</span>';
}

function showFmHint(evt) {
  evt.stopPropagation();
  var text = evt.target.getAttribute('data-hint');
  if (!text) return;
  var popup = document.getElementById('fm-hint-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'fm-hint-popup';
    document.body.appendChild(popup);
    document.addEventListener('click', function(e) {
      if (!popup.contains(e.target) && !e.target.classList.contains('calc-info')) {
        popup.style.display = 'none';
      }
    });
  }
  popup.textContent = text;
  var rect = evt.target.getBoundingClientRect();
  popup.style.top  = (rect.bottom + 6) + 'px';
  popup.style.left = Math.max(8, rect.left - 8) + 'px';
  popup.style.display = 'block';
}

// Special category field: label has wizard link inline, content area can transform
function fmCategoryField(currentValue, span2) {
  const cls = 'fm-field' + (span2 ? ' span2' : '');
  return '<div class="' + cls + '" id="fm-category-field">' +
    '<label class="fm-label">' +
      'Category ' +
      '<a href="javascript:void(0)" class="cat-wizard-link" onclick="catWizardOpen()">' +
        '✨ Help me choose' +
      '</a>' +
    '</label>' +
    '<div id="fm-category-content">' +
      fmSearchableSelect('fm-category', FM_PROJ_CATEGORIES, currentValue, 'Type to search categories…', CATEGORY_DESCRIPTIONS) +
    '</div>' +
  '</div>';
}

function fmTaskCategoryField(currentValue, span2) {
  const cls = 'fm-field' + (span2 ? ' span2' : '');
  return '<div class="' + cls + '" id="fm-category-field">' +
    '<label class="fm-label">' +
      'Category ' +
      '<a href="javascript:void(0)" class="cat-wizard-link" onclick="taskCatWizardOpen()">' +
        '✨ Help me choose' +
      '</a>' +
    '</label>' +
    '<div id="fm-task-category-content">' +
      fmSearchableSelect('fm-category', FM_TASK_CATEGORIES, currentValue, 'Type to search categories…', TASK_CATEGORY_DESCRIPTIONS) +
    '</div>' +
  '</div>';
}

// Searchable dropdown: renders a text input with a filterable dropdown list
// descriptions is an optional map of { optionValue: 'short description' }
function fmSearchableSelect(id, options, value, placeholder, descriptions) {
  const opts = (value && !options.includes(value)) ? [...options, value] : options;
  let optionsHtml = opts.map(function(o) {
    const desc = (descriptions && descriptions[o]) ? descriptions[o] : '';
    const descAttr = desc ? ' data-desc="' + esc(desc) + '"' : '';
    const descHtml = desc ? '<span class="fm-search-option-desc">' + esc(desc) + '</span>' : '';
    return '<div class="fm-search-option" data-value="' + esc(o) + '"' + descAttr + '>' +
      '<span class="fm-search-option-name">' + esc(o) + '</span>' + descHtml + '</div>';
  }).join('');
  return '<div class="fm-search-select" id="' + id + '-wrap">' +
    '<input type="text" id="' + id + '" class="fm-input" value="' + (value ? esc(value) : '') + '" ' +
    'placeholder="' + (placeholder || '') + '" autocomplete="off">' +
    '<input type="hidden" id="' + id + '-val" value="' + (value ? esc(value) : '') + '">' +
    '<div class="fm-search-dropdown" id="' + id + '-dropdown">' + optionsHtml + '</div>' +
  '</div>';
}

// Initialize searchable dropdown behavior after form is rendered
function initSearchableSelect(id) {
  const input = document.getElementById(id);
  const hidden = document.getElementById(id + '-val');
  const dropdown = document.getElementById(id + '-dropdown');
  if (!input || !dropdown) return;

  const allOptions = Array.from(dropdown.querySelectorAll('.fm-search-option'));
  let highlighted = -1;

  function showDropdown() { dropdown.classList.add('open'); }
  function hideDropdown() { dropdown.classList.remove('open'); highlighted = -1; }

  function highlightText(text, query) {
    if (!query) return esc(text);
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query);
    if (idx < 0) return esc(text);
    return esc(text.substring(0, idx)) +
      '<span class="fm-search-match">' + esc(text.substring(idx, idx + query.length)) + '</span>' +
      esc(text.substring(idx + query.length));
  }

  function filterOptions() {
    const q = input.value.toLowerCase().trim();
    let visibleCount = 0;
    allOptions.forEach(function(opt) {
      const val = opt.getAttribute('data-value');
      const desc = opt.getAttribute('data-desc') || '';
      const matchesName = !q || val.toLowerCase().indexOf(q) >= 0;
      const matchesDesc = !q || desc.toLowerCase().indexOf(q) >= 0;
      if (matchesName || matchesDesc) {
        opt.style.display = '';
        // Rebuild inner HTML with highlighting
        const nameHtml = '<span class="fm-search-option-name">' + highlightText(val, q) + '</span>';
        const descHtml = desc ? '<span class="fm-search-option-desc">' + highlightText(desc, q) + '</span>' : '';
        opt.innerHTML = nameHtml + descHtml;
        visibleCount++;
      } else {
        opt.style.display = 'none';
      }
    });
    if (visibleCount > 0) showDropdown(); else hideDropdown();
    highlighted = -1;
  }

  function selectOption(val) {
    input.value = val;
    hidden.value = val;
    hideDropdown();
    // Dispatch change event so other components can react
    hidden.dispatchEvent(new Event('change'));
  }

  function showAllOptions() {
    allOptions.forEach(function(opt) {
      opt.style.display = '';
      const val = opt.getAttribute('data-value');
      const desc = opt.getAttribute('data-desc') || '';
      const nameHtml = '<span class="fm-search-option-name">' + esc(val) + '</span>';
      const descHtml = desc ? '<span class="fm-search-option-desc">' + esc(desc) + '</span>' : '';
      opt.innerHTML = nameHtml + descHtml;
    });
    highlighted = -1;
    showDropdown();
  }

  input.addEventListener('focus', function() { showAllOptions(); input.select(); });
  input.addEventListener('input', function() { filterOptions(); });

  input.addEventListener('keydown', function(e) {
    const visible = allOptions.filter(function(o) { return o.style.display !== 'none'; });
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlighted = Math.min(highlighted + 1, visible.length - 1);
      visible.forEach(function(o, i) { o.classList.toggle('highlighted', i === highlighted); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlighted = Math.max(highlighted - 1, 0);
      visible.forEach(function(o, i) { o.classList.toggle('highlighted', i === highlighted); });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < visible.length) {
        selectOption(visible[highlighted].getAttribute('data-value'));
      }
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  });

  // Click on option
  dropdown.addEventListener('click', function(e) {
    const opt = e.target.closest('.fm-search-option');
    if (opt) selectOption(opt.getAttribute('data-value'));
  });

  // Close on click outside
  document.addEventListener('click', function(e) {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) hideDropdown();
  });
}

// Renders a checkbox grid for selecting multiple team members.
// currentVal is a comma-separated string of already-selected names.
// The contact (primary) is excluded from the "other members" list.
function fmMemberMultiSelect(id, members, currentVal) {
  const selected = (currentVal || '').split(',').map(s => s.trim()).filter(Boolean);
  const checks = members.map(function(name) {
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const checked = selected.includes(name) ? ' checked' : '';
    return '<label class="fm-member-check">' +
      '<input type="checkbox" name="' + id + '" value="' + name + '"' + checked + '>' +
      '<span class="fm-member-avatar' + (Auth.fullName && name === Auth.fullName ? ' user-self-avatar' : '') + (getMemberAvatarEmoji(name) ? ' user-emoji-av' : '') + '">' + (getMemberAvatarEmoji(name) || initials) + '</span>' +
      name +
      '</label>';
  }).join('');
  return '<div class="fm-members-grid" id="' + id + '-wrap">' + checks + '</div>';
}

// ── Category Wizard ──────────────────────────────────────────────
// Two-question guided walkthrough to help users pick the right project category.
const CAT_WIZARD_TREE = {
  q1: {
    question: 'What best describes the primary nature of this project?',
    options: [
      { label: 'Building or creating a new solution', next: 'q2_create' },
      { label: 'Maintaining, supporting, or upgrading something existing', next: 'q2_maintain' },
      { label: 'Analyzing data or producing insights', next: 'q2_data' },
      { label: 'Planning, documenting, or enabling others', next: 'q2_knowledge' },
      { label: 'Serving another department or the public', next: 'q2_service' },
      { label: 'None of these fit my project', category: 'Other' },
    ]
  },
  q2_create: {
    question: 'What are you primarily building?',
    options: [
      { label: 'A GIS map, spatial dataset, or location-based app', category: 'Spatial Data Services & GIS Product Development' },
      { label: 'An AI model, ML solution, or automated process', category: 'AI Enablement, Automation & Machine Intelligence' },
      { label: 'A workflow connecting multiple tools or systems', category: 'Multi-Application Workflow Development' },
      { label: 'A data pipeline, database, or system integration', category: 'Data Processing, Integration & Engineering' },
      { label: 'A public-facing tool, open data portal, or story map', category: 'Public Engagement & Open Data' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q2_maintain: {
    question: 'What best describes the work?',
    options: [
      { label: 'Updating or enhancing an existing application', category: 'Application Update & Enhancement' },
      { label: 'Managing enterprise platforms, licenses, or accounts', category: 'Enterprise Administration & Platform Management' },
      { label: 'Monitoring, troubleshooting, or supporting production systems', category: 'Operational Support & Sustainment Activities' },
      { label: 'Migrating or modernizing legacy infrastructure', category: 'Infrastructure Modernization & Platform Migration' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q2_data: {
    question: "What's the primary focus?",
    options: [
      { label: 'Producing reports, dashboards, or actionable insights', category: 'Data Analysis, Reporting & Insights' },
      { label: 'Building or maintaining data pipelines and integrations', category: 'Data Processing, Integration & Engineering' },
      { label: 'Establishing data standards, policies, or compliance', category: 'Data Governance, Compliance & Policy' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q2_knowledge: {
    question: "What's the main deliverable?",
    options: [
      { label: 'Strategic plans, roadmaps, or solution architecture', category: 'Strategic Planning & Architecture' },
      { label: 'Documentation, SOPs, or knowledge base content', category: 'Documentation & Knowledge Management' },
      { label: 'Training materials, workshops, or user communities', category: 'Training, Enablement & Community' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
  q2_service: {
    question: 'Who is the primary audience?',
    options: [
      { label: 'Another city department', category: 'Interdepartmental Consulting & Support' },
      { label: 'The general public or external community', category: 'Public Engagement & Open Data' },
      { label: 'None of these fit', category: 'Other' },
    ]
  },
};

// Stores the original category field HTML so we can restore it

function catWizardOpen() {
  const container = document.getElementById('fm-category-content');
  if (!container) return;
  // Save the current field content so we can restore it
  Internal.catWizardHTML = container.innerHTML;
  catWizardRenderStep('q1');
}

function catWizardClose() {
  const container = document.getElementById('fm-category-content');
  if (!container || !Internal.catWizardHTML) return;
  container.innerHTML = Internal.catWizardHTML;
  Internal.catWizardHTML = '';
  // Re-initialize the searchable select
  initSearchableSelect('fm-category');
}

function catWizardRenderStep(stepId) {
  const container = document.getElementById('fm-category-content');
  if (!container) return;
  const step = CAT_WIZARD_TREE[stepId];
  if (!step) return;

  const isQ2 = stepId !== 'q1';
  let html = '<div class="cat-wizard-panel open">';
  html += '<div class="cat-wizard-q">' + (isQ2 ? 'Step 2 of 2: ' : 'Step 1 of 2: ') + esc(step.question) + '</div>';
  html += '<div class="cat-wizard-opts">';
  step.options.forEach(function(opt) {
    if (opt.next) {
      html += '<button type="button" class="cat-wizard-opt" onclick="catWizardRenderStep(\'' + opt.next + '\')">' + esc(opt.label) + '</button>';
    } else if (opt.category) {
      html += '<button type="button" class="cat-wizard-opt" onclick="catWizardShowResult(\'' + esc(opt.category).replace(/'/g, "\\'") + '\')">' + esc(opt.label) + '</button>';
    }
  });
  html += '</div>';
  html += '<div style="margin-top:8px;">';
  if (isQ2) {
    html += '<button type="button" class="cat-wizard-back" onclick="catWizardRenderStep(\'q1\')">← Back</button>';
  }
  html += ' <button type="button" class="cat-wizard-back" onclick="catWizardClose()">Cancel</button>';
  html += '</div></div>';
  container.innerHTML = html;
}

function catWizardShowResult(categoryName) {
  const container = document.getElementById('fm-category-content');
  if (!container) return;
  const desc = CATEGORY_DESCRIPTIONS[categoryName] || '';
  let html = '<div class="cat-wizard-panel open">';
  html += '<div class="cat-wizard-result">' +
    '<div class="cat-wizard-result-label">✓ Recommended Category</div>' +
    '<div class="cat-wizard-result-name">' + esc(categoryName) + '</div>' +
    (desc ? '<div class="cat-wizard-result-desc">' + esc(desc) + '</div>' : '') +
    '<button type="button" class="cat-wizard-result-btn" onclick="catWizardApply(\'' + esc(categoryName).replace(/'/g, "\\'") + '\')">Use This Category</button>' +
  '</div>';
  html += '<div style="margin-top:8px;">';
  html += '<button type="button" class="cat-wizard-back" onclick="catWizardRenderStep(\'q1\')">← Start over</button>';
  html += ' <button type="button" class="cat-wizard-back" onclick="catWizardClose()">Cancel</button>';
  html += '</div></div>';
  container.innerHTML = html;
}

function catWizardApply(categoryName) {
  // Restore the original field, then set the selected value
  catWizardClose();
  const input = document.getElementById('fm-category');
  const hidden = document.getElementById('fm-category-val');
  if (input) input.value = categoryName;
  if (hidden) hidden.value = categoryName;
}

// ══════════════════════════════════════════════════════════════════════
//  SIZE WIZARD — scoring-based 4-question wizard for project sizing
// ══════════════════════════════════════════════════════════════════════
function sizeWizardOpen() {
  _sizeWizardAnswers = [-1, -1, -1, -1];
  _sizeWizardStep = 0;
  sizeWizardRender();
}

function sizeWizardClose() {
  var panel = document.getElementById('size-wizard-panel');
  if (panel) panel.innerHTML = '';
  if (panel) panel.classList.remove('open');
}

function sizeWizardPick(optIdx) {
  _sizeWizardAnswers[_sizeWizardStep] = optIdx;
  setTimeout(function() {
    _sizeWizardStep++;
    sizeWizardRender();
  }, 180);
}

function sizeWizardBack() {
  if (_sizeWizardStep > 0) { _sizeWizardStep--; sizeWizardRender(); }
}

function sizeWizardReset() {
  _sizeWizardAnswers = [-1, -1, -1, -1];
  _sizeWizardStep = 0;
  sizeWizardRender();
}

function sizeWizardScoreToSize(totalScore) {
  for (var i = 0; i < SIZE_WIZARD_MAP.length; i++) {
    if (totalScore >= SIZE_WIZARD_MAP[i].range[0] && totalScore <= SIZE_WIZARD_MAP[i].range[1]) return SIZE_WIZARD_MAP[i];
  }
  return SIZE_WIZARD_MAP[SIZE_WIZARD_MAP.length - 1];
}

function sizeWizardRender() {
  var panel = document.getElementById('size-wizard-panel');
  if (!panel) return;
  panel.classList.add('open');

  if (_sizeWizardStep < 4) {
    var q = SIZE_WIZARD_QUESTIONS[_sizeWizardStep];
    var html = '<div class="size-wz-progress">';
    for (var i = 0; i < 4; i++) {
      html += '<div class="size-wz-pip ' + (i < _sizeWizardStep ? 'done' : (i === _sizeWizardStep ? 'current' : '')) + '"></div>';
    }
    html += '</div>';
    html += '<div class="size-wz-step-label">' + q.label + '</div>';
    html += '<div class="size-wz-q">' + esc(q.question) + '</div>';
    html += '<div class="size-wz-opts">';
    q.options.forEach(function(o, oi) {
      html += '<div class="size-wz-opt" onclick="sizeWizardPick(' + oi + ')">';
      html += '<div class="size-wz-dot"></div>';
      html += '<div><div style="font-weight:700;">' + esc(o.label) + '</div>';
      html += '<div class="size-wz-opt-desc">' + esc(o.desc) + '</div></div></div>';
    });
    html += '</div>';
    html += '<div class="size-wz-nav">';
    if (_sizeWizardStep > 0) html += '<button type="button" class="cat-wizard-back" onclick="sizeWizardBack()">← Back</button>';
    html += ' <button type="button" class="cat-wizard-back" onclick="sizeWizardClose()">Cancel</button>';
    html += '</div>';
    panel.innerHTML = html;
  } else {
    // Result
    var total = 0;
    for (var j = 0; j < 4; j++) total += SIZE_WIZARD_QUESTIONS[j].options[_sizeWizardAnswers[j]].score;
    var size = sizeWizardScoreToSize(total);
    var factorLabels = ['Duration', 'Team size', 'Deliverables', 'Stakeholders'];
    var html = '<div class="size-wz-progress">';
    for (var p = 0; p < 4; p++) html += '<div class="size-wz-pip done"></div>';
    html += '</div>';
    html += '<div class="size-wz-result">';
    html += '<div class="size-wz-result-size">' + size.key + '</div>';
    html += '<div class="size-wz-result-label">' + esc(size.label) + ' project</div>';
    html += '<div class="size-wz-result-desc">' + esc(size.desc) + '</div>';
    html += '</div>';
    html += '<div class="size-wz-factors">';
    for (var f = 0; f < 4; f++) {
      html += '<div class="size-wz-factor"><div class="size-wz-factor-label">' + factorLabels[f] + '</div>';
      html += '<div class="size-wz-factor-val">' + esc(SIZE_WIZARD_QUESTIONS[f].options[_sizeWizardAnswers[f]].label) + '</div></div>';
    }
    html += '</div>';
    var defaults = _allocationDefaults[size.key] || {};
    html += '<div style="font-size:11px;font-weight:700;color:var(--navy);margin-bottom:4px;">Default weekly allocation for this size:</div>';
    var roles = ['Lead', 'Contributor', 'Reviewer'];
    roles.forEach(function(r) {
      html += '<div class="size-wz-alloc-row"><span style="color:var(--text-muted);">' + r + '</span><span style="font-weight:700;color:var(--navy);">' + (defaults[r] || 0) + '% of project time</span></div>';
    });
    html += '<div class="size-wz-nav" style="margin-top:12px;">';
    html += '<button type="button" class="cat-wizard-back" onclick="sizeWizardBack()">← Back</button>';
    html += ' <button type="button" class="cat-wizard-back" onclick="sizeWizardReset()">Start over</button>';
    html += ' <button type="button" class="size-wz-use-btn" onclick="sizeWizardApply(\'' + size.key + '\')">Use ' + size.key + ' (' + size.label + ')</button>';
    html += '</div>';
    panel.innerHTML = html;
  }
}

function sizeWizardApply(sizeKey) {
  var sel = document.getElementById('fm-project-size');
  if (sel) sel.value = sizeKey;
  sizeWizardClose();
}

// ══════════════════════════════════════════════════════════════════════
//  Helper: build project size field with wizard link
// ══════════════════════════════════════════════════════════════════════
function fmProjectSizeField(currentValue) {
  var options = ['S', 'M', 'L', 'XL'];
  var labels = { S: 'S — Small', M: 'M — Medium', L: 'L — Large', XL: 'XL — Extra large' };
  var selectHtml = '<select class="fm-input" id="fm-project-size">';
  selectHtml += '<option value="">Select size…</option>';
  options.forEach(function(opt) {
    selectHtml += '<option value="' + opt + '"' + (opt === currentValue ? ' selected' : '') + '>' + esc(labels[opt]) + '</option>';
  });
  selectHtml += '</select>';
  selectHtml += '<button type="button" class="size-wizard-link" style="margin-left:0;margin-top:6px;" onclick="sizeWizardOpen()">✨ Help me choose a size</button>';
  selectHtml += '<div id="size-wizard-panel" class="size-wizard-panel"></div>';
  return fmField('Project Size', selectHtml);
}

// ══════════════════════════════════════════════════════════════════════
//  FORM — UNIFIED TEAM MEMBER SELECTOR WITH AVAILABILITY
//  Shows each team member as a row with checkbox, avatar, name, role,
//  and availability badge. Replaces both the old checkbox grid and
//  the separate availability panel.
// ══════════════════════════════════════════════════════════════════════
var _formMemberRoles = {}; // { name: 'Contributor'|'Reviewer' } — persists across re-renders

function renderTeamAvailList(currentOtherMembers, currentContact) {
  var container = document.getElementById('fm-team-avail-list');
  if (!container) return;

  var members = FM_ACTIVE_MEMBERS || FM_TASK_ASSIGNEES || [];
  if (!members.length) { container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);">No team members found.</div>'; return; }

  // Preserve current role selections before re-rendering
  members.forEach(function(name) {
    var sel = document.getElementById('fm-role-' + name.replace(/\s/g, '_'));
    if (sel) _formMemberRoles[name] = sel.value;
  });

  var selected = (currentOtherMembers || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var size = getVal('fm-project-size') || 'M';
  var contact = currentContact || getVal('fm-contact') || '';

  // Compute availability if resources data is loaded
  var avData = null;
  try { if (RESOURCES_DATA && RESOURCES_DATA.people) avData = fcAvailData(); } catch(e) {}
  var curIdx = window.currentWeekIdx || 9;

  var html = '';
  members.forEach(function(name) {
    var initials = name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    var checked = selected.includes(name);
    var isContact = name === contact;
    var jobRole = '';
    var isLight = false;
    if (RESOURCES_DATA && RESOURCES_DATA.people && RESOURCES_DATA.people[name]) {
      jobRole = RESOURCES_DATA.people[name].role || '';
      isLight = RESOURCES_DATA.people[name].tracking_level === 'light';
    }

    // Get selected project role for this member
    var memberRole = isContact ? 'Lead' : (_formMemberRoles[name] || 'Contributor');

    // Determine availability badge based on selected role
    var badgeHtml = '';
    if (isLight) {
      badgeHtml = '<span class="fm-ta-badge" style="background:#FFF7ED;color:#9A3412;">Collaborator</span>';
    } else if (avData && avData[name]) {
      var result = findEarliestStart(avData, name, size, memberRole);
      if (result.startWeek === -1) {
        badgeHtml = '<span class="fm-ta-badge fm-ta-full">At capacity</span>';
      } else if (result.startWeek <= curIdx) {
        badgeHtml = '<span class="fm-ta-badge fm-ta-now">Available now</span>';
      } else {
        badgeHtml = '<span class="fm-ta-badge fm-ta-soon">' + cpWeekLabel(result.startWeek) + '</span>';
      }
    }

    // Role dropdown for non-lead, non-light members
    var roleHtml = '';
    if (!isContact && !isLight) {
      var safeId = 'fm-role-' + name.replace(/\s/g, '_');
      var contribSel = memberRole === 'Contributor' ? ' selected' : '';
      var reviewerSel = memberRole === 'Reviewer' ? ' selected' : '';
      roleHtml = '<select id="' + safeId + '" class="fm-ta-role-select" onclick="event.stopPropagation()" onchange="fmRoleChange(\'' + esc(name).replace(/'/g, "\\'") + '\',this.value)">' +
        '<option value="Contributor"' + contribSel + '>Contributor</option>' +
        '<option value="Reviewer"' + reviewerSel + '>Reviewer</option>' +
      '</select>';
    }

    var rowClass = 'fm-ta-row' + (checked ? ' fm-ta-checked' : '') + (isContact ? ' fm-ta-contact' : '');
    html += '<div class="' + rowClass + '">';
    html += '<input type="checkbox" class="fm-ta-cb" name="fm-other-members" value="' + esc(name) + '"' + (checked ? ' checked' : '') + ' onclick="event.stopPropagation();fmMemberCbChanged()">';
    (function() {
      var emj = getMemberAvatarEmoji(name);
      var selfCls = Auth.fullName && name === Auth.fullName ? ' user-self-avatar' : '';
      html += '<div class="fm-ta-avatar' + selfCls + (emj ? ' user-emoji-av' : '') + '">' + (emj || initials) + '</div>';
    })();
    html += '<div style="flex:1;min-width:0;">';
    html += '<div class="fm-ta-name">' + esc(name) + (isContact ? ' <span style="font-size:9px;background:#002669;color:#fff;padding:1px 5px;border-radius:4px;font-weight:700;vertical-align:middle;">LEAD</span>' : '') + '</div>';
    if (jobRole) html += '<div class="fm-ta-role">' + esc(jobRole) + '</div>';
    html += '</div>';
    html += roleHtml;
    html += badgeHtml;
    html += '</div>';
  });

  container.innerHTML = html;
}

function fmToggleMember(name) {
  var cb = document.querySelector('input[name="fm-other-members"][value="' + name + '"]');
  if (!cb) return;
  cb.checked = !cb.checked;
  var currentMembers = [...document.querySelectorAll('input[name="fm-other-members"]:checked')].map(function(c) { return c.value; }).join(', ');
  var contact = getVal('fm-contact') || '';
  renderTeamAvailList(currentMembers, contact);
}

function fmMemberCbChanged() {
  // Called when checkbox is clicked directly — browser already toggled it, just re-render
  var currentMembers = [...document.querySelectorAll('input[name="fm-other-members"]:checked')].map(function(c) { return c.value; }).join(', ');
  var contact = getVal('fm-contact') || '';
  renderTeamAvailList(currentMembers, contact);
}

function fmRoleChange(name, role) {
  _formMemberRoles[name] = role;
  // Re-render to update availability badge for the new role
  var currentMembers = [...document.querySelectorAll('input[name="fm-other-members"]:checked')].map(function(c) { return c.value; }).join(', ');
  var contact = getVal('fm-contact') || '';
  renderTeamAvailList(currentMembers, contact);
}

// ── Phase Requirements Multi-Select Widget ──────────────────────────
function buildPhaseReqSelector(currentValue) {
  var selected = currentValue ? currentValue.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  var tagsHtml = selected.map(function(rId) {
    var info = REQUIREMENT_LOOKUP[rId];
    var label = info ? 'P' + info.phaseId + ': ' + info.label.substring(0, 35) : rId;
    return '<span class="phase-req-tag" data-req="' + esc(rId) + '">' + esc(label) + '<span class="phase-req-tag-x" onclick="removePhaseReq(\'' + esc(rId) + '\')">&times;</span></span>';
  }).join('');
  return '<input type="hidden" id="fm-phase-reqs-val" value="' + esc(currentValue || '') + '">' +
    '<div id="fm-phase-reqs-tags" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">' + tagsHtml + '</div>' +
    '<button type="button" onclick="togglePhaseReqDropdown()" style="font-size:12px;font-weight:600;padding:5px 12px;background:#EEF2FF;color:var(--navy);border:1px solid #C7D2FE;border-radius:6px;cursor:pointer;font-family:Lato,sans-serif;">+ Add requirements</button>' +
    '<div id="fm-phase-reqs-dropdown" style="display:none;margin-top:6px;" class="phase-req-dropdown"></div>';
}
function togglePhaseReqDropdown() {
  var dd = document.getElementById('fm-phase-reqs-dropdown');
  if (!dd) return;
  if (dd.style.display !== 'none') { dd.style.display = 'none'; return; }
  dd.style.display = '';
  renderPhaseReqDropdown();
}
function renderPhaseReqDropdown() {
  var dd = document.getElementById('fm-phase-reqs-dropdown');
  if (!dd) return;
  var current = (document.getElementById('fm-phase-reqs-val') || {}).value || '';
  var selected = current ? current.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  var html = '';
  LIFECYCLE_PHASES.forEach(function(phase) {
    html += '<div class="phase-req-group-label">' + (phase.isGateCheck ? '⚑ ' : '') + 'Phase ' + phase.id + ' — ' + esc(phase.name) + '</div>';
    phase.requirements.forEach(function(req) {
      var isSelected = selected.indexOf(req.id) !== -1;
      html += '<div class="phase-req-option' + (isSelected ? ' selected' : '') + '" onclick="togglePhaseReq(\'' + req.id + '\')">';
      html += '<input type="checkbox"' + (isSelected ? ' checked' : '') + ' style="pointer-events:none;accent-color:var(--navy);">';
      html += '<span>' + esc(req.label) + '</span></div>';
    });
  });
  dd.innerHTML = html;
}
function togglePhaseReq(reqId) {
  var hidden = document.getElementById('fm-phase-reqs-val');
  if (!hidden) return;
  var current = hidden.value ? hidden.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  var idx = current.indexOf(reqId);
  if (idx !== -1) current.splice(idx, 1); else current.push(reqId);
  hidden.value = current.join(',');
  var tagsEl = document.getElementById('fm-phase-reqs-tags');
  if (tagsEl) {
    tagsEl.innerHTML = current.map(function(rId) {
      var info = REQUIREMENT_LOOKUP[rId];
      var label = info ? 'P' + info.phaseId + ': ' + info.label.substring(0, 35) : rId;
      return '<span class="phase-req-tag" data-req="' + esc(rId) + '">' + esc(label) + '<span class="phase-req-tag-x" onclick="removePhaseReq(\'' + esc(rId) + '\')">&times;</span></span>';
    }).join('');
  }
  renderPhaseReqDropdown();
}
function removePhaseReq(reqId) { togglePhaseReq(reqId); }

// ── Beta: live duration estimate on the project form ──────────────────
// Reference-class forecast — predicts duration from the actual durations of
// similar completed projects (by category, blended with partner department).
// Reads PROJECTS live, so it self-updates as projects close. Gated behind the
// 'durationEstimate' beta flag.
function _durStats(projects) {
  var WK = 7 * 86400000;
  var ds = [];
  projects.forEach(function(p) {
    if (p.status !== 'Complete') return;
    var s = p.start ? new Date(p.start + 'T12:00:00').getTime() : null;
    var ae = p.actual_end ? new Date(p.actual_end + 'T12:00:00').getTime() : null;
    if (s == null || ae == null) return;
    var w = (ae - s) / WK;
    if (w >= 1) ds.push(w);
  });
  if (!ds.length) return null;
  ds.sort(function(a, b) { return a - b; });
  var q = function(pc) { var i = (ds.length - 1) * pc, lo = Math.floor(i), hi = Math.ceil(i); return ds[lo] + (ds[hi] - ds[lo]) * (i - lo); };
  return { n: ds.length, median: q(0.5), p25: q(0.25), p75: q(0.75) };
}

function durEstUseDate(dateStr) {
  // Fill the editable target-date field: Original End Date if editable, else Working Due.
  var end = document.getElementById('fm-end');
  if (end && !end.readOnly && !end.disabled) { end.value = dateStr; return; }
  var wd = document.getElementById('fm-working-due');
  if (wd) wd.value = dateStr;
}

function updateDurationEstimate() {
  var box = document.getElementById('fm-duration-est');
  if (!box) return;
  if (typeof isFeatureOn === 'function' && !isFeatureOn('durationEstimate')) { box.innerHTML = ''; return; }
  var cat = ((document.getElementById('fm-category-val') || document.getElementById('fm-category') || {}).value) || '';
  var partner = ((document.getElementById('fm-partner-dept') || {}).value) || '';
  var startEl = document.getElementById('fm-start');
  var startVal = startEl ? startEl.value : '';
  var all = (typeof PROJECTS !== 'undefined') ? PROJECTS : [];
  var catStats = cat ? _durStats(all.filter(function(p) { return (p.category || '') === cat; })) : null;
  var partnerStats = partner ? _durStats(all.filter(function(p) { return (p.partner_dept || '') === partner; })) : null;

  if (!catStats && !partnerStats) {
    box.innerHTML = '<div style="margin-top:10px;border:1px dashed var(--border);border-radius:8px;background:#F8FAFC;padding:14px;text-align:center;font-size:12px;color:var(--text-muted);">Pick a <strong>category</strong> below (and ideally a partner department) to estimate this project\'s duration from similar completed projects.</div>';
    return;
  }
  var median, n, base, basis;
  if (catStats && partnerStats) {
    median = (catStats.median * catStats.n + partnerStats.median * partnerStats.n) / (catStats.n + partnerStats.n);
    n = Math.min(catStats.n, partnerStats.n); base = catStats;
    basis = 'Based on ' + catStats.n + ' ' + esc(cat) + ' projects, adjusted for ' + esc(partner) + ' (' + partnerStats.n + ').';
  } else if (catStats) {
    median = catStats.median; n = catStats.n; base = catStats;
    basis = 'Based on ' + catStats.n + ' ' + esc(cat) + ' projects. Add a partner department to sharpen it.';
  } else {
    median = partnerStats.median; n = partnerStats.n; base = partnerStats;
    basis = 'Based on ' + partnerStats.n + ' ' + esc(partner) + ' projects. Add a category to sharpen it.';
  }
  var wks = Math.round(median);
  var scale = base.median > 0 ? median / base.median : 1;
  var low = Math.max(1, Math.round(base.p25 * scale));
  var high = Math.round(base.p75 * scale);
  var months = wks / 4.33;
  var conf = n >= 10 ? { l: 'High confidence', bg: '#DCFCE7', fg: '#166534' }
    : n >= 5 ? { l: 'Medium confidence', bg: '#FEF9C3', fg: '#854D0E' }
    : n >= 3 ? { l: 'Low confidence', bg: '#F3F4F6', fg: '#6B7280' }
    : { l: 'Too few samples', bg: '#F3F4F6', fg: '#9CA3AF' };
  var sugg = '';
  if (startVal) { var d = new Date(startVal + 'T12:00:00'); d.setDate(d.getDate() + wks * 7); sugg = d.toISOString().slice(0, 10); }
  var suggLabel = sugg ? new Date(sugg + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  var html = '<div style="margin-top:10px;border:1px solid #D9E2F2;border-radius:10px;background:#F5F8FF;padding:14px 16px;">';
  html += '<div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">';
  html += '<div style="flex:0 0 auto;"><div style="font-size:30px;font-weight:900;color:var(--navy);line-height:1;">' + wks + ' wks</div><div style="font-size:11px;color:var(--text-muted);">&asymp; ' + (months >= 2 ? months.toFixed(months < 8 ? 1 : 0) : months.toFixed(1)) + ' months</div></div>';
  html += '<div style="flex:1;min-width:200px;">';
  html += '<div style="font-size:12px;margin-bottom:4px;">Typical range <strong style="color:var(--navy);">' + low + '–' + high + ' weeks</strong> <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;background:' + conf.bg + ';color:' + conf.fg + ';padding:2px 7px;border-radius:8px;margin-left:4px;">' + conf.l + '</span></div>';
  if (sugg) html += '<div style="font-size:12px;">Suggested target end: <strong style="color:var(--navy);">' + suggLabel + '</strong> <button type="button" onclick="durEstUseDate(\'' + sugg + '\')" style="border:1px solid var(--navy);background:var(--navy);color:#fff;border-radius:6px;padding:4px 10px;font-weight:700;font-size:11px;cursor:pointer;margin-left:6px;">Use this date</button></div>';
  else html += '<div style="font-size:11px;color:var(--text-muted);">Set a start date to get a suggested end date.</div>';
  html += '</div></div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px;">' + basis + '</div>';
  if (n < 5) html += '<div style="font-size:11px;color:#9A3412;background:#FFF7ED;border-radius:6px;padding:6px 10px;margin-top:6px;">Thin history for this mix — treat as a rough anchor, not a commitment.</div>';
  html += '<div style="font-size:10px;color:var(--text-muted);font-style:italic;margin-top:6px;">Estimate from completed projects; updates automatically as more close. Beta.</div>';
  html += '</div>';
  box.innerHTML = html;
}

function buildProjectForm(p) {
  const v = function(k) {
    if (p) return p[k] || '';
    if (k === 'contact') return Auth.fullName || '';
    return '';
  };
  const isEdit = !!p;
  const isIdea = p && p.status === 'Idea';
  // Original End Date is locked once project reaches Active status
  const isActive = p && (p.status === 'Active' || p.status === 'Complete' || p.status === 'On Hold' || p.status === 'Canceled');
  const endDateField = isActive
    ? '<input id="fm-end" type="date" class="fm-input" value="' + esc(v('end')) + '" readonly style="background:#F3F1EB;color:var(--text-muted);cursor:not-allowed;">' +
      '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Locked — set when project was created</div>'
    : '<input id="fm-end" type="date" class="fm-input" value="' + esc(v('end')) + '">';

  // For Idea status: disable operational fields, keep descriptive fields editable
  var ideaNote = isIdea ? '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#92400E;">' +
    '<span style="font-weight:700;">This project is an Idea.</span> ' +
    (isAdmin() ? 'Operational fields are available once the idea is reviewed and promoted.' : 'Operational fields like team, timeline, and sizing will become available once this idea is reviewed and promoted.') +
  '</div>' : '';

  var canOps = !(isIdea && !isAdmin());

  // Beta (durationEstimate): guided step-flow layout — groups the estimate's
  // inputs (category, partner, start) ahead of the target-date fields so the
  // suggestion informs the end date. Falls through to the classic layout when
  // the beta is off, or for non-admins editing an Idea (operational fields are
  // hidden in that case, so the classic conditionals handle it).
  if (typeof isFeatureOn === 'function' && isFeatureOn('durationEstimate') && canOps) {
    var gUnit = fmField('Unit',
      fmSelect('fm-itd-team', FM_ITD_TEAMS,
        v('itd_team') || (function() {
          if (!Auth || !Auth.fullName || typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.people) return '';
          var me = RESOURCES_DATA.people[Auth.fullName];
          return (me && me.role) || '';
        })(),
        'Select unit…'),
      false, false,
      'The smallest organizational grouping doing the work — typically a sub-team within a Team (e.g. GIS within Data Intelligence). Pick "Not in Unit" for team-wide work that doesn\'t fit a specific sub-team. Defaults to your own unit on new projects. Used by Project Review scoping and the Portfolio sidebar filter.');
    var gTeam = fmField('Team',
      fmSelect('fm-owning-team', FM_OWNING_TEAMS,
        v('owning_team') || (function() {
          if (!Auth || !Auth.fullName || typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.people) return '';
          var me = RESOURCES_DATA.people[Auth.fullName];
          return (me && me.team) || '';
        })(),
        'Select team…', false),
      false, false,
      'The team that owns the project — set on every project regardless of whether it\'s Data Program work. The Unit above (if any) is a sub-team within this team. Defaults to your own team on new projects. Drives the Data Program portfolio view (when combined with the Data Program checkbox below) and lead-team edit permissions.');
    var gDataProgram = fmField('Data Program',
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;font-family:Cardo,serif;font-size:14px;">' +
        '<input type="checkbox" id="fm-is-data-program" ' + ((v('is_data_program') == 1) ? 'checked' : '') + ' style="width:18px;height:18px;cursor:pointer;accent-color:var(--navy);"> ' +
        '<span>This project is part of the Data Program portfolio</span>' +
      '</label>',
      false, false,
      'Check if this project is part of the strategic Data Program initiative (not just owned by a DP-eligible team). Drives the Data Program slide on the Slideshow and the Data Program Lite app.');
    var gTeamAvail = '<div id="fm-team-avail-list"></div>' +
      '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Select team members for this project. Availability' + calcInfoIcon('earliestStart') + ' is based on the project size selected above.</div>';
    var gDetails = '<div class="fm-grid">' +
      fmField('Problem Statement', fmMdTextarea('fm-problem', v('problem_statement'), 'Describe the problem this project solves…', 3, 4000), false, true) +
      fmField('Description', fmMdTextarea('fm-description', v('description'), 'Project description…', 3, 4000), false, true) +
      fmField('Definition of Done', fmMdTextarea('fm-definition-of-done', v('definition_of_done'), 'What does it mean for this project to be complete? Concrete, observable outcomes.', 3, 4000), false, true, 'When will we know this project is finished?') +
      fmField('Key Results', fmMdTextarea('fm-key-results', v('key_results'), 'Measurable indicators that this project succeeded.', 3, 4000), false, true, 'How will we measure success?') +
      fmField('Data Sources', fmMdTextarea('fm-data-sources', v('data_sources'), 'e.g. Hansen, Accela, ArcGIS Enterprise, CSV from partner dept…', 2, 2000), false, true) +
      fmField('Technical Requirements', fmMdTextarea('fm-tech-reqs', v('technical_requirements'), 'e.g. Must integrate with existing system, ADA compliant, real-time updates…', 2, 4000), false, true) +
    '</div>';
    var gAlignment = fmSec('Strategic Alignment',
      '<div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="font-size:11px;color:var(--text-muted);">Tag this project with the strategic initiatives, goals, and criteria it supports.</div>' +
        (isStrategicAlignmentEditor() ? '<button type="button" class="ai-help-btn" onclick="suggestAlignment()" style="font-size:11px;padding:4px 12px;">✨ Suggest Alignment</button>' : '') +
      '</div>' +
      '<div id="alignment-suggest-panel" style="display:none;"></div>' +
      '<div class="fm-grid">' +
        (isStrategicAlignmentEditor() ? fmField('IT Initiative', fmCheckboxGroup('fm-it-initiative', FM_IT_INITIATIVES, v('it_initiative')), false, true) : '') +
        fmField('City Initiative', fmCheckboxGroup('fm-city-initiative', FM_CITY_INITIATIVES, v('city_initiative')), false, true) +
        fmField('IT Priority Project', fmCheckboxGroup('fm-it-priority', FM_IT_PRIORITY_PROJECTS, v('it_priority_project')), false, true) +
        (isStrategicAlignmentEditor() ? fmField('Data Program Goal', fmCheckboxGroup('fm-dp-goal', FM_DP_GOALS, v('dp_goal')), false, true, 'Which Data Program goals does this project advance?') : '') +
        (isStrategicAlignmentEditor() ? fmField('WWC Foundational Practice', fmCheckboxGroup('fm-wwc-practice', FM_WWC_PRACTICES, v('wwc_practice')), false, true, 'What Works Cities foundational practice areas') : '') +
      '</div>' +
      (isStrategicAlignmentEditor() ? fmField('WWC Criteria', fmWwcCriteriaGrouped(v('wwc_criteria')), false, false, 'Specific What Works Cities certification criteria — grouped by practice area') : ''), true);
    return ideaNote +
      fmSec('1 · What is it?', '<div class="fm-grid">' +
        fmField('Title', fmInput('fm-title-val', v('title'), 'Project title…'), true, true) +
        fmField('Status', fmSelect('fm-status', FM_PROJ_STATUSES, v('status'), 'Select status…', false)) +
        fmCategoryField(v('category'), true) +
        fmField('Partner Department', fmSelect('fm-partner-dept', FM_PARTNER_DEPTS, v('partner_dept'), 'Select department…')) +
        fmField('Priority', fmSelect('fm-priority', FM_PROJ_PRIORITIES, v('priority'), 'Select priority…', false)) +
        fmProjectSizeField(v('project_size')) +
      '</div>') +
      fmSec('2 · Who &amp; when?', '<div class="fm-grid">' +
        fmField('Project Lead', fmSelect('fm-contact', FM_ACTIVE_MEMBERS || FM_TASK_ASSIGNEES, v('contact'), 'Select lead…', false)) +
        gUnit + gTeam +
      '</div>' + gTeamAvail +
      '<div class="fm-grid">' + fmField('Start Date', fmInput('fm-start', v('start'), '', 'date')) + '</div>' +
      '<div id="fm-duration-est"></div>') +
      fmSec('3 · Target dates', '<div class="fm-grid">' +
        fmField('Original End Date', endDateField) +
        fmField('Working Due Date', fmInput('fm-working-due', v('working_due'), '', 'date')) +
        (p && p.status === 'Complete' ? fmField('Completion Date', fmInput('fm-actual-end', v('actual_end'), '', 'date'), false, false, 'When this project was actually completed') : '') +
      '</div>') +
      fmSec('4 · Details', '<div class="fm-grid">' + gDataProgram + '</div>' + gDetails, isEdit) +
      gAlignment;
  }

  return ideaNote +
  fmSec('Essentials', '<div class="fm-grid">' +
      fmField('Title', fmInput('fm-title-val', v('title'), 'Project title…'), true, true) +
      fmField('Status', fmSelect('fm-status', FM_PROJ_STATUSES, v('status'), 'Select status…', false)) +
      (isIdea && !isAdmin() ? '' : fmField('Priority', fmSelect('fm-priority', FM_PROJ_PRIORITIES, v('priority'), 'Select priority…', false))) +
      (isIdea && !isAdmin() ? '' : fmProjectSizeField(v('project_size'))) +
      (isIdea && !isAdmin() ? '' : fmField('Project Lead', fmSelect('fm-contact', FM_ACTIVE_MEMBERS || FM_TASK_ASSIGNEES, v('contact'), 'Select lead…', false))) +
    '</div>') +
  (isIdea && !isAdmin() ? '' : fmSec('Team', '<div id="fm-team-avail-list"></div>' +
      '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Select team members for this project. Availability' + calcInfoIcon('earliestStart') + ' is based on the project size selected above.</div>')) +
  (isIdea && !isAdmin() ? '' : fmSec('Timeline', '<div class="fm-grid">' +
      fmField('Start Date', fmInput('fm-start', v('start'), '', 'date')) +
      fmField('Original End Date', endDateField) +
      fmField('Working Due Date', fmInput('fm-working-due', v('working_due'), '', 'date')) +
      (p && p.status === 'Complete' ? fmField('Completion Date', fmInput('fm-actual-end', v('actual_end'), '', 'date'), false, false, 'When this project was actually completed') : '') +
    '</div>' +
    ((typeof isFeatureOn === 'function' && isFeatureOn('durationEstimate')) ? '<div id="fm-duration-est"></div>' : ''))) +
  fmSec('Classification', '<div class="fm-grid">' +
      fmCategoryField(v('category'), true) +
      fmField('Partner Department', fmSelect('fm-partner-dept', FM_PARTNER_DEPTS, v('partner_dept'), 'Select department…')) +
      fmField('Unit',
        fmSelect('fm-itd-team', FM_ITD_TEAMS,
          v('itd_team') || (function() {
            // Default to the logged-in user's own unit when the project hasn't
            // been assigned one yet. Local model key is .role (aliased from
            // team_members.owning_unit on load — see index.html).
            if (!Auth || !Auth.fullName || typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.people) return '';
            var me = RESOURCES_DATA.people[Auth.fullName];
            return (me && me.role) || '';
          })(),
          'Select unit…'),
        false, false,
        'The smallest organizational grouping doing the work — typically a sub-team within a Team (e.g. GIS within Data Intelligence). Pick "Not in Unit" for team-wide work that doesn\'t fit a specific sub-team. Defaults to your own unit on new projects. Used by Project Review scoping and the Portfolio sidebar filter.') +
      fmField('Team',
        fmSelect('fm-owning-team',
          FM_OWNING_TEAMS,
          v('owning_team') || (function() {
            // Default to the logged-in user's own team when the project hasn't
            // been assigned one yet. Local model key is .team (aliased from
            // team_members.owning_team on load — see index.html).
            if (!Auth || !Auth.fullName || typeof RESOURCES_DATA === 'undefined' || !RESOURCES_DATA || !RESOURCES_DATA.people) return '';
            var me = RESOURCES_DATA.people[Auth.fullName];
            return (me && me.team) || '';
          })(),
          'Select team…',
          false),
        false, false,
        'The team that owns the project — set on every project regardless of whether it\'s Data Program work. The Unit above (if any) is a sub-team within this team. Defaults to your own team on new projects. Drives the Data Program portfolio view (when combined with the Data Program checkbox below) and lead-team edit permissions.') +
      fmField('Data Program',
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;font-family:Cardo,serif;font-size:14px;">' +
          '<input type="checkbox" id="fm-is-data-program" ' + ((v('is_data_program') == 1) ? 'checked' : '') + ' style="width:18px;height:18px;cursor:pointer;accent-color:var(--navy);"> ' +
          '<span>This project is part of the Data Program portfolio</span>' +
        '</label>',
        false, false,
        'Check if this project is part of the strategic Data Program initiative (not just owned by a DP-eligible team). Drives the Data Program slide on the Slideshow and the Data Program Lite app.') +
    '</div>') +
  fmSec('Details', '<div class="fm-grid">' +
      fmField('Problem Statement', fmMdTextarea('fm-problem', v('problem_statement'), 'Describe the problem this project solves…', 3, 4000), false, true) +
      fmField('Description', fmMdTextarea('fm-description', v('description'), 'Project description…', 3, 4000), false, true) +
      fmField('Definition of Done', fmMdTextarea('fm-definition-of-done', v('definition_of_done'), 'What does it mean for this project to be complete? Concrete, observable outcomes.', 3, 4000), false, true,
        'When will we know this project is finished?') +
      fmField('Key Results', fmMdTextarea('fm-key-results', v('key_results'), 'Measurable indicators that this project succeeded.', 3, 4000), false, true,
        'How will we measure success?') +
      fmField('Data Sources', fmMdTextarea('fm-data-sources', v('data_sources'), 'e.g. Hansen, Accela, ArcGIS Enterprise, CSV from partner dept…', 2, 2000), false, true) +
      fmField('Technical Requirements', fmMdTextarea('fm-tech-reqs', v('technical_requirements'), 'e.g. Must integrate with existing system, ADA compliant, real-time updates…', 2, 4000), false, true) +
    '</div>', isEdit) +
  (isIdea && !isAdmin() ? '' : fmSec('Strategic Alignment',
    '<div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;">' +
      '<div style="font-size:11px;color:var(--text-muted);">Tag this project with the strategic initiatives, goals, and criteria it supports.</div>' +
      (isStrategicAlignmentEditor() ? '<button type="button" class="ai-help-btn" onclick="suggestAlignment()" style="font-size:11px;padding:4px 12px;">✨ Suggest Alignment</button>' : '') +
    '</div>' +
    '<div id="alignment-suggest-panel" style="display:none;"></div>' +
    '<div class="fm-grid">' +
      (isStrategicAlignmentEditor() ? fmField('IT Initiative', fmCheckboxGroup('fm-it-initiative', FM_IT_INITIATIVES, v('it_initiative')), false, true) : '') +
      fmField('City Initiative', fmCheckboxGroup('fm-city-initiative', FM_CITY_INITIATIVES, v('city_initiative')), false, true) +
      fmField('IT Priority Project', fmCheckboxGroup('fm-it-priority', FM_IT_PRIORITY_PROJECTS, v('it_priority_project')), false, true) +
      (isStrategicAlignmentEditor() ? fmField('Data Program Goal', fmCheckboxGroup('fm-dp-goal', FM_DP_GOALS, v('dp_goal')), false, true,
        'Which Data Program goals does this project advance?') : '') +
      (isStrategicAlignmentEditor() ? fmField('WWC Foundational Practice', fmCheckboxGroup('fm-wwc-practice', FM_WWC_PRACTICES, v('wwc_practice')), false, true,
        'What Works Cities foundational practice areas') : '') +
    '</div>' +
    (isStrategicAlignmentEditor() ? fmField('WWC Criteria', fmWwcCriteriaGrouped(v('wwc_criteria')), false, false,
        'Specific What Works Cities certification criteria — grouped by practice area') : ''), true));
}

function fmSec(label, bodyHtml, startCollapsed, extraClass) {
  var cls = 'fm-sec' + (startCollapsed ? ' collapsed' : '') + (extraClass ? ' ' + extraClass : '');
  return '<div class="' + cls + '">' +
    '<div class="fm-sec-hd" onclick="this.parentElement.classList.toggle(\'collapsed\')">' +
      '<span class="fm-sec-hd-label">' + label + '</span>' +
      '<span class="fm-sec-chev">&#9662;</span>' +
    '</div>' +
    '<div class="fm-sec-body">' + bodyHtml + '</div>' +
  '</div>';
}

function fmWwcCriteriaGrouped(currentVal, disabled) {
  var selected = (currentVal || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var disabledAttr = disabled ? ' disabled' : '';
  var html = disabled ? '<div style="opacity:0.6;pointer-events:none;">' : '';
  WWC_CRITERIA_GROUPS.forEach(function(grp) {
    var grpSelected = grp.items.filter(function(c) { return selected.includes(c); }).length;
    var startOpen = grpSelected > 0;
    html += '<div class="wwc-group' + (startOpen ? '' : ' collapsed') + '">';
    html += '<div class="wwc-group-hd" onclick="this.parentElement.classList.toggle(\'collapsed\')">';
    html += '<span class="wwc-chev">&#9662;</span>';
    html += esc(grp.label) + ' (' + grp.prefix + ')';
    html += '<span class="wwc-group-count">' + grp.items.length + ' criteria' + (grpSelected ? ' · ' + grpSelected + ' selected' : '') + '</span>';
    html += '</div>';
    html += '<div class="wwc-group-body"><div class="fm-deliverables-grid">';
    grp.items.forEach(function(opt) {
      var checked = selected.includes(opt) ? ' checked' : '';
      html += '<label class="fm-deliv-check"><input type="checkbox" name="fm-wwc-criteria" value="' + esc(opt) + '"' + checked + disabledAttr + '>' + esc(opt) + '</label>';
    });
    html += '</div></div></div>';
  });
  if (disabled) html += '</div>';
  return html;
}

// ── AI Strategic Alignment Suggestions ──────────────────────────────
var _alignmentSuggestions = null;

async function suggestAlignment() {
  var panel = document.getElementById('alignment-suggest-panel');
  if (!panel) return;

  // Read current form values
  var title = (document.getElementById('fm-title-val') || {}).value || '';
  var desc = (document.getElementById('fm-description') || {}).value || '';
  var problem = (document.getElementById('fm-problem') || {}).value || '';
  var category = (document.getElementById('fm-category') || {}).value || '';
  var partnerDept = (document.getElementById('fm-partner-dept') || {}).value || '';
  var definitionOfDone = (document.getElementById('fm-definition-of-done') || {}).value || '';
  var keyResults = (document.getElementById('fm-key-results') || {}).value || '';
  var dataSources = (document.getElementById('fm-data-sources') || {}).value || '';
  var techReqs = (document.getElementById('fm-tech-reqs') || {}).value || '';

  if (!title) { showToast('Enter a project title first so AI can make recommendations.', 'warn'); return; }

  panel.style.display = '';
  panel.innerHTML = '<div style="text-align:center;padding:16px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;">' +
    '<div style="font-size:20px;margin-bottom:6px;">🤔</div>' +
    '<div style="font-size:12px;color:#92400E;font-weight:600;">Analyzing project for strategic alignment…</div>' +
    '<div style="font-size:11px;color:#92400E;opacity:0.7;margin-top:4px;">This may take 10-15 seconds.</div></div>';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  var prompt = 'You are a strategic alignment advisor for the City of Tucson\'s Data Team. ' +
    'Analyze the following project and recommend which strategic alignment checkboxes should be checked.\n\n' +
    'PROJECT DETAILS:\n' +
    'Title: ' + title + '\n' +
    'Category: ' + (category || 'Not set') + '\n' +
    'Partner Department: ' + (partnerDept || 'Not set') + '\n' +
    'Problem Statement: ' + (problem || 'Not provided') + '\n' +
    'Description: ' + (desc || 'Not provided') + '\n' +
    'Definition of Done: ' + (definitionOfDone || 'Not specified') + '\n' +
    'Key Results: ' + (keyResults || 'Not specified') + '\n' +
    'Data Sources: ' + (dataSources || 'Not specified') + '\n' +
    'Technical Requirements: ' + (techReqs || 'Not specified') + '\n\n' +
    'AVAILABLE ALIGNMENT OPTIONS:\n\n' +
    'IT Initiative (these are sub-objectives under Goal 3.3: "Enhance Data Management and Analytics Capabilities" from the City IT Strategic Plan):\n' +
    '  - 3.3.1 — Assess current state of data management: Conduct a comprehensive assessment of the current state of data management, identifying data silos, quality issues, and unmet analytics needs\n' +
    '  - 3.3.2 — Data governance framework: Develop a data governance framework, including policies and procedures for data collection, storage, security, access, and sharing\n' +
    '  - 3.3.3 — Evaluate data analytics tools & platforms: Identify and evaluate potential data analytics tools and platforms to meet the City\'s needs\n' +
    '  - 3.3.4 — Data controls for retention & destruction: Begin implementing data controls for retention and destruction for Level 2 & 3 data\n' +
    '  - 3.3.5 — Pilot data analytics solutions: Pilot the implementation of a data analytics solution focused on a key area (e.g., citizen services or infrastructure management)\n\n' +
    'City Initiative (major cross-departmental City priorities):\n' +
    FM_CITY_INITIATIVES.map(function(o) { return '  - ' + o; }).join('\n') + '\n\n' +
    'IT Priority Project (top IT department priority projects):\n' +
    FM_IT_PRIORITY_PROJECTS.map(function(o) { return '  - ' + o; }).join('\n') + '\n\n' +
    'Data Program Goal (goals of the City\'s Data Program — the overarching multi-year effort to build data maturity):\n' +
    FM_DP_GOALS.map(function(o) { return '  - ' + o; }).join('\n') + '\n\n' +
    'WWC Foundational Practice (What Works Cities certification practice areas — broad categories of data-driven governance):\n' +
    FM_WWC_PRACTICES.map(function(o) { return '  - ' + o; }).join('\n') + '\n\n' +
    'WWC Criteria (specific What Works Cities certification criteria — only recommend ones the project directly advances):\n' +
    FM_WWC_CRITERIA.map(function(o) { return '  - ' + o; }).join('\n') + '\n\n' +
    'IMPORTANT RULES:\n' +
    '- Be HIGHLY SELECTIVE. Only recommend options where there is a clear, direct, and obvious connection to this specific project\'s work. If you have to stretch to make a connection, do not recommend it.\n' +
    '- USING "None": Each field includes a "None" option. If you evaluate a field and determine that none of the specific options apply, recommend [{"value": "None", "reason": "brief explanation of why nothing applies"}]. Use "None" confidently — most projects will only match a few fields, and "None" is the correct answer for the rest.\n' +
    '- For IT Initiative, only recommend if the project\'s primary outcome directly advances that specific sub-objective. Otherwise recommend None.\n' +
    '- For City Initiative, only recommend if the project is explicitly part of or directly supports that named initiative. Otherwise recommend None.\n' +
    '- For IT Priority Project, only recommend if the project is part of or directly contributes to that named priority effort. Otherwise recommend None.\n' +
    '- For Data Program Goal, ONLY recommend a goal if the project builds the capabilities, processes, or infrastructure of the data team itself (e.g., establishing governance policies, building shared data platforms, creating training programs, improving data quality practices, deploying new analytics tools) AND the project\'s outcomes materially advance that specific goal. Do NOT recommend Data Program Goals for routine operational work, one-off departmental data requests, individual app builds for a partner department, or projects that merely use data without building the team\'s underlying capabilities. The Data Program is about building organizational data maturity — only projects that advance that mission should be tagged. Otherwise recommend None.\n' +
    '- For WWC Foundational Practice, recommend None if the project does not clearly advance any practice area.\n' +
    '- WWC PAIRING RULE (MANDATORY): If you recommend any WWC Foundational Practice (other than None), you MUST also recommend at least one corresponding WWC Criteria from that same practice area. If you recommend any WWC Criteria, the parent practice area MUST appear in wwc_practice. They must always be paired. If you cannot identify a specific criterion, do not recommend the practice area either.\n' +
    '- For WWC Criteria, only recommend criteria where the project\'s outcomes directly and specifically contribute to meeting that criterion — not just broadly related.\n' +
    '- Provide a brief, specific reason for each recommendation explaining HOW this project advances that item (or why None applies).\n\n' +
    'Respond ONLY with a JSON object (no markdown, no backticks). Format:\n' +
    '{\n' +
    '  "it_initiative": [{"value": "3.3.1 — Assess current state of data management", "reason": "brief reason"}],\n' +
    '  "city_initiative": [{"value": "None", "reason": "not part of any named city initiative"}],\n' +
    '  "it_priority_project": [{"value": "None", "reason": "not part of a named IT priority project"}],\n' +
    '  "dp_goal": [{"value": "Establish Data Governance", "reason": "brief reason"}],\n' +
    '  "wwc_practice": [{"value": "None", "reason": "no clear connection to WWC practice areas"}],\n' +
    '  "wwc_criteria": []\n' +
    '}\n\n' +
    'Every "value" must EXACTLY match one of the available options listed above (including "None"). Do not mix "None" with other values in the same field — if any specific option applies, do not also include "None".';

  try {
    var text = await callAiProxy('alignmentSuggest', prompt);
    var clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    var objStart = clean.indexOf('{');
    var objEnd = clean.lastIndexOf('}');
    if (objStart === -1 || objEnd === -1) throw new Error('Could not find JSON in response.');
    _alignmentSuggestions = JSON.parse(clean.substring(objStart, objEnd + 1));

    // Validate WWC pairing: practices and criteria must correspond
    if (_alignmentSuggestions.wwc_practice && _alignmentSuggestions.wwc_criteria) {
      var practiceAreas = (_alignmentSuggestions.wwc_practice || []).map(function(p) { return p.value; });
      var criteriaItems = (_alignmentSuggestions.wwc_criteria || []).map(function(c) { return c.value; });
      // Map criteria prefixes to practice area names
      var prefixToArea = { CI: 'Community Impact', DM: 'Data Management', BF: 'Data-Driven Budget and Finance',
        EVAL: 'Evaluations', LC: 'Leadership and Capacity', OD: 'Open Data',
        PA: 'Performance and Analytics', RDC: 'Results-Driven Contracting' };
      // Ensure every criteria has its parent practice
      criteriaItems.forEach(function(c) {
        var prefix = c.match(/^([A-Z]+)\d/);
        if (prefix && prefixToArea[prefix[1]]) {
          var area = prefixToArea[prefix[1]];
          if (!practiceAreas.includes(area)) {
            _alignmentSuggestions.wwc_practice.push({ value: area, reason: 'Required — paired with ' + c.split(' ')[0] });
            practiceAreas.push(area);
          }
        }
      });
      // Remove practices that have no corresponding criteria
      if (_alignmentSuggestions.wwc_practice.length > 0) {
        var areaPrefixes = {};
        Object.keys(prefixToArea).forEach(function(k) { areaPrefixes[prefixToArea[k]] = k; });
        _alignmentSuggestions.wwc_practice = _alignmentSuggestions.wwc_practice.filter(function(p) {
          var prefix = areaPrefixes[p.value];
          if (!prefix) return true;
          return criteriaItems.some(function(c) { return c.indexOf(prefix) === 0; });
        });
      }
    }

    renderAlignmentSuggestions();
  } catch (err) {
    console.error('[AlignSuggest] Failed:', err);
    panel.innerHTML = '<div style="text-align:center;padding:16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;">' +
      '<div style="font-size:14px;margin-bottom:4px;">⚠️</div>' +
      '<div style="font-size:12px;color:#991B1B;">' + esc(err.message) + '</div>' +
      '<button onclick="suggestAlignment()" style="margin-top:8px;padding:4px 12px;background:var(--navy);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;">Try Again</button>' +
      ' <button onclick="document.getElementById(\'alignment-suggest-panel\').style.display=\'none\'" style="margin-top:8px;padding:4px 12px;background:#E5E7EB;color:#374151;border:none;border-radius:6px;font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;">Dismiss</button></div>';
  }
}

function renderAlignmentSuggestions() {
  var panel = document.getElementById('alignment-suggest-panel');
  if (!panel || !_alignmentSuggestions) return;

  var fieldMeta = {
    it_initiative: { label: 'IT Initiative', color: '#EEF2FF', textColor: '#002669' },
    city_initiative: { label: 'City Initiative', color: '#FFF7ED', textColor: '#9A3412' },
    it_priority_project: { label: 'IT Priority Project', color: '#F0FDF4', textColor: '#166534' },
    dp_goal: { label: 'Data Program Goal', color: '#FDF4FF', textColor: '#86198F' },
    wwc_practice: { label: 'WWC Foundational Practice', color: '#FFFBEB', textColor: '#92400E' },
    wwc_criteria: { label: 'WWC Criteria', color: '#F0F9FF', textColor: '#0C4A6E' }
  };

  var totalCount = 0;
  var html = '<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px;margin-bottom:4px;">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">';
  html += '<span style="font-size:12px;font-weight:700;color:#92400E;">✨ AI Alignment Suggestions</span>';
  html += '<button onclick="document.getElementById(\'alignment-suggest-panel\').style.display=\'none\'" style="background:none;border:none;cursor:pointer;font-size:14px;color:#92400E;padding:0 4px;">✕</button>';
  html += '</div>';

  Object.keys(fieldMeta).forEach(function(key) {
    var items = _alignmentSuggestions[key];
    if (!items || !items.length) return;
    var fm = fieldMeta[key];
    html += '<div style="margin-bottom:8px;">';
    html += '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:' + fm.textColor + ';margin-bottom:4px;">' + fm.label + '</div>';
    items.forEach(function(item, i) {
      totalCount++;
      var cbId = 'align-sug-' + key + '-' + i;
      html += '<label style="display:flex;align-items:flex-start;gap:6px;padding:4px 8px;border-radius:6px;cursor:pointer;background:' + fm.color + ';margin-bottom:3px;">';
      html += '<input type="checkbox" checked class="align-sug-cb" data-field="' + key + '" data-value="' + esc(item.value) + '" id="' + cbId + '" style="margin-top:2px;width:13px;height:13px;accent-color:var(--navy);flex-shrink:0;">';
      html += '<div><div style="font-size:12px;font-weight:600;color:' + fm.textColor + ';">' + esc(item.value) + '</div>';
      if (item.reason) html += '<div style="font-size:11px;color:' + fm.textColor + ';opacity:0.7;">' + esc(item.reason) + '</div>';
      html += '</div></label>';
    });
    html += '</div>';
  });

  if (totalCount === 0) {
    html += '<div style="text-align:center;padding:8px;font-size:12px;color:#92400E;">No specific alignment recommendations for this project.</div>';
  } else {
    html += '<div style="display:flex;gap:8px;margin-top:10px;">';
    html += '<button onclick="applyAlignmentSuggestions()" style="padding:5px 14px;background:var(--navy);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;">Apply Selected</button>';
    html += '<button onclick="document.getElementById(\'alignment-suggest-panel\').style.display=\'none\'" style="padding:5px 14px;background:#E5E7EB;color:#374151;border:none;border-radius:6px;font-size:11px;font-weight:700;font-family:Lato,sans-serif;cursor:pointer;">Dismiss</button>';
    html += '<span style="font-size:10px;color:#92400E;opacity:0.7;align-self:center;margin-left:auto;">' + totalCount + ' suggestions · uncheck any to skip</span>';
    html += '</div>';
  }
  html += '</div>';
  panel.innerHTML = html;
}

function applyAlignmentSuggestions() {
  var checkboxes = document.querySelectorAll('.align-sug-cb:checked');
  var applied = 0;
  checkboxes.forEach(function(cb) {
    var field = cb.getAttribute('data-field');
    var value = cb.getAttribute('data-value');
    // Map field key to form checkbox name
    var nameMap = {
      it_initiative: 'fm-it-initiative',
      city_initiative: 'fm-city-initiative',
      it_priority_project: 'fm-it-priority',
      dp_goal: 'fm-dp-goal',
      wwc_practice: 'fm-wwc-practice',
      wwc_criteria: 'fm-wwc-criteria'
    };
    var formName = nameMap[field];
    if (!formName) return;
    // Find the matching form checkbox and check it
    var formCbs = document.querySelectorAll('input[name="' + formName + '"]');
    formCbs.forEach(function(formCb) {
      if (formCb.value === value) {
        formCb.checked = true;
        applied++;
        // For WWC criteria, expand the parent group if collapsed
        var group = formCb.closest('.wwc-group');
        if (group && group.classList.contains('collapsed')) {
          group.classList.remove('collapsed');
        }
      }
    });
  });
  document.getElementById('alignment-suggest-panel').style.display = 'none';
  showToast(applied + ' alignment' + (applied !== 1 ? 's' : '') + ' applied. Review and save when ready.', 'success');
}

// Set transiently by addTaskToProject so a new task opened from a project
// detail page pre-selects that project. Consumed (read once and cleared)
// inside buildTaskForm so it can't leak into a later manually-opened form.
var _prefillTaskProject = null;

function buildTaskForm(t) {
  const v = function(k) {
    if (t) {
      // The tasks layer stores project_number (the FK), not a title. Tasks
      // loaded from AGOL therefore have no t.project — resolve the title
      // from the canonical FK so the dropdown defaults correctly. Falls back
      // to the legacy t.project only if the lookup can't resolve it.
      if (k === 'project') {
        var resolved = (typeof getTaskProjectTitle === 'function') ? getTaskProjectTitle(t) : '';
        return resolved || t.project || '';
      }
      return t[k] || '';
    }
    if (k === 'assignee') return Auth.fullName || '';
    if (k === 'project' && _prefillTaskProject) {
      var pv = _prefillTaskProject;
      _prefillTaskProject = null; // consume once
      return pv;
    }
    return '';
  };
  const projTitles = PROJECTS.filter(function(p) {
    return p.status !== 'Canceled' && p.status !== 'Complete' && p.status !== 'Idea';
  }).map(function(p) { return p.title; }).sort();
  return '<div class="fm-section-label">Basic Info</div>' +
    '<div class="fm-grid">' +
      fmField('Title', fmInput('fm-title-val', v('title'), 'Task title…'), true, true) +
      fmField('Status', fmSelect('fm-status', FM_TASK_STATUSES, v('status'), 'Select status…'), true) +
      fmField('Priority', fmSelect('fm-priority', FM_TASK_PRIORITIES, v('priority'), 'Select priority…')) +
      fmField('Assignee', fmSelect('fm-assignee', FM_ACTIVE_MEMBERS || FM_TASK_ASSIGNEES, v('assignee'), 'Select assignee…'), true) +
    '</div>' +
    '<div class="fm-section-label">Details</div>' +
    '<div class="fm-grid">' +
      fmField('Description', fmMdTextarea('fm-description', v('description'), 'Task description…', 3, 4000), true, true) +
    '</div>' +
    '<div class="fm-section-label">Classification</div>' +
    '<div class="fm-grid">' +
      fmField('Project', fmSelect('fm-project', projTitles, v('project'), 'Select project…'), true, true) +
      fmTaskToolField(v('tool'), false) +
      fmTaskCategoryField(v('category'), false) +
    '</div>' +
    (isFeatureOn('dependencies') ?
      '<div class="fm-section-label">Dependencies</div>' +
      '<div class="fm-grid">' +
        '<input type="hidden" id="dep-current-task-num" value="' + esc(v('task_number')) + '">' +
        fmField('Depends on', '<div id="fm-blocked-by-list" style="border:1px solid #E8E6DF;border-radius:6px;padding:8px;font-size:12px;color:var(--text-muted);">Loading...</div>', false, true,
          'Search for tasks or projects that must be completed before this task can start.') +
      '</div>' : '') +
    '<div class="fm-section-label">Timeline</div>' +
    '<div class="fm-grid">' +
      fmField('Start Date', fmInput('fm-start', v('start'), '', 'date')) +
      fmField('Original Due Date', fmInput('fm-due', v('due'), '', 'date')) +
      fmField('Working Due Date', fmInput('fm-working-due', v('working_due'), '', 'date')) +
      (t && t.status === 'Complete' ? fmField('Completion Date', fmInput('fm-actual-end', v('actual_end'), '', 'date'), false, false, 'When this task was actually completed') : '') +
    '</div>' +
    (t && (t.status === 'Complete' || t.status === 'Canceled') ?
      '<div class="fm-section-label">Resolution</div>' +
      '<div class="fm-grid">' +
        fmField('What was done', fmMdTextarea('fm-resolution', v('resolution'), 'Summarize the work completed, decisions made, or deliverables produced…', 3, 4000), false, true,
          'Visible to the team — describe what was accomplished or why this was canceled.') +
      '</div>' : '');
}

function openFormModal(mode, id) {
  if (!ensureValidSession(function() { openFormModal(mode, id); })) return;
  refreshEnums(); // Rebuild enum lists from live data so new values are always present
  Editor.mode   = mode;
  Editor.editId = (id !== undefined) ? id : null;
  const isProject = mode.indexOf('project') >= 0;
  const isEdit    = mode.indexOf('edit')    >= 0;
  const record    = isEdit ? (isProject ? DataStore.getProject(id) : DataStore.getTask(id)) : null;

  // Permission check: admin OR project lead OR (Data Program Lead whose
  // team owns this project) can edit. canEditProject() in auth.js
  // captures all three cases.
  if (isEdit && isProject && record && typeof canEditProject === 'function' && !canEditProject(record)) {
    showToast('Only the project lead, the team\'s Data Program lead, or an admin can edit this project.', 'warn');
    return;
  }

  document.getElementById('fm-type-badge').textContent = isProject ? 'PROJECT' : 'TASK';
  document.getElementById('fm-title').textContent      = isEdit ? (isProject ? 'Edit Project' : 'Edit Task')
                                                                 : (isProject ? 'New Project'  : 'New Task');
  document.getElementById('fm-delete-btn').style.display = isEdit ? 'inline-block' : 'none';
  document.getElementById('fm-save-btn').textContent     = isEdit ? 'Save Changes' : 'Create';
  document.getElementById('fm-save-btn').disabled         = false;
  document.getElementById('fm-save-btn').style.opacity    = '1';
  document.getElementById('fm-body').innerHTML           = isProject ? buildProjectForm(record) : buildTaskForm(record);
  // Lock original due date for tasks on edit (project lock is handled in buildProjectForm based on status)
  if (isEdit && !isProject) {
    const origDateField = document.getElementById('fm-due');
    if (origDateField) {
      origDateField.disabled = true;
      origDateField.style.background = '#F3F1EB';
      origDateField.style.color = '#6B7280';
      origDateField.style.cursor = 'not-allowed';
      origDateField.title = 'Original date is locked after creation. Use Working Due Date to adjust the timeline.';
    }
  }
  document.getElementById('form-modal-backdrop').classList.add('open');
  // Initialize searchable dropdowns (category field uses searchable select in both forms)
  initSearchableSelect('fm-category');
  // Tool field uses searchable select in task forms
  if (!isProject) initSearchableSelect('fm-tool');
  // Populate dependency picker for task forms
  if (!isProject && isFeatureOn('dependencies')) {
    var projTitle = record ? record.project : '';
    var taskNum = record ? record.task_number : '';
    var blockedBy = record ? (record.blocked_by || '') : '';
    refreshBlockerList(projTitle, taskNum, blockedBy);
  }
  // Render unified team member selector with availability for project forms
  if (isProject) {
    var otherMembers = record ? (record.other_members || '') : '';
    var contact = record ? (record.contact || '') : '';
    // Reset form member roles
    _formMemberRoles = {};
    // Pre-populate roles from existing allocation records when editing
    if (isEdit && record && RESOURCES_DATA && RESOURCES_DATA.people) {
      var memberNames = (otherMembers || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      memberNames.forEach(function(name) {
        var person = RESOURCES_DATA.people[name];
        if (person && person.allocations) {
          person.allocations.forEach(function(a) {
            if (a.project === record.title && a.role) {
              _formMemberRoles[name] = a.role;
            }
          });
        }
      });
    }
    renderTeamAvailList(otherMembers, contact);
    // Re-render availability when size or contact changes
    var sizeSelect = document.getElementById('fm-project-size');
    if (sizeSelect) sizeSelect.addEventListener('change', function() {
      var curMembers = [...document.querySelectorAll('input[name="fm-other-members"]:checked')].map(function(c) { return c.value; }).join(', ');
      renderTeamAvailList(curMembers, getVal('fm-contact'));
    });
    var contactSelect = document.getElementById('fm-contact');
    if (contactSelect) contactSelect.addEventListener('change', function() {
      var curMembers = [...document.querySelectorAll('input[name="fm-other-members"]:checked')].map(function(c) { return c.value; }).join(', ');
      renderTeamAvailList(curMembers, getVal('fm-contact'));
    });
    // Disable Status dropdown for non-admin users editing Idea projects
    if (record && record.status === 'Idea' && !isAdmin()) {
      var statusEl = document.getElementById('fm-status');
      if (statusEl) { statusEl.disabled = true; statusEl.style.background = '#F3F1EB'; statusEl.style.color = '#6B7280'; statusEl.style.cursor = 'not-allowed'; }
    }
    // Beta: live duration estimate — recompute when category / partner / start change.
    if (typeof isFeatureOn === 'function' && isFeatureOn('durationEstimate')) {
      ['fm-category-val', 'fm-partner-dept', 'fm-start'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', updateDurationEstimate);
      });
      updateDurationEstimate();
    }
  }
}

function closeFormModal() {
  document.getElementById('form-modal-backdrop').classList.remove('open');
  var btn = document.getElementById('fm-save-btn');
  if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  // Clear auto-saved form state
  try { localStorage.removeItem('tracker_form_autosave'); } catch(e) {}
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function collectProjectFields() {
  const title = getVal('fm-title-val');
  if (!title) {
    const el = document.getElementById('fm-title-val');
    if (el) el.classList.add('err');
    return null;
  }
  // Collect checked team members from the checkbox grid
  const memberBoxes = document.querySelectorAll('input[name="fm-other-members"]:checked');
  const otherMembers = [...memberBoxes].map(cb => cb.value).join(', ') || null;
  return {
    title:             title,
    status:            getVal('fm-status')       || null,
    priority:          getVal('fm-priority')     || null,
    contact:           getVal('fm-contact')      || null,
    other_members:     otherMembers,
    partner_dept:      getVal('fm-partner-dept') || null,
    itd_team:          getVal('fm-itd-team')     || null,
    owning_team:       getVal('fm-owning-team')  || null,
    category:          getVal('fm-category')     || null,
    project_size:      getVal('fm-project-size') || null,
    start:             getVal('fm-start')        || null,
    end:               getVal('fm-end')          || null,
    working_due:       getVal('fm-working-due')  || null,
    problem_statement: getVal('fm-problem')      || null,
    description:       getVal('fm-description')  || null,
    definition_of_done: getVal('fm-definition-of-done') || null,
    key_results:       getVal('fm-key-results')  || null,
    data_sources:      getVal('fm-data-sources') || null,
    technical_requirements: getVal('fm-tech-reqs') || null,
    actual_end:        getVal('fm-actual-end')   || null,
    is_data_program:   (function() {
      // Primary signal: the explicit Data Program checkbox.
      var cb = document.getElementById('fm-is-data-program');
      if (cb && cb.checked) return 1;
      // Legacy auto-default: if a Data Program Goal is set but the checkbox
      // wasn't ticked, still treat as DP (preserves the pre-Phase-6 behavior
      // where setting dp_goal alone made a project DP).
      var dpg = collectCheckboxGroup('fm-dp-goal');
      return dpg && dpg.trim().length > 0 && dpg.trim() !== 'None' ? 1 : 0;
    })(),
    it_initiative:     collectCheckboxGroup('fm-it-initiative'),
    city_initiative:   collectCheckboxGroup('fm-city-initiative'),
    it_priority_project: collectCheckboxGroup('fm-it-priority'),
    dp_goal:           collectCheckboxGroup('fm-dp-goal'),
    wwc_practice:      collectCheckboxGroup('fm-wwc-practice'),
    wwc_criteria:      collectCheckboxGroup('fm-wwc-criteria'),
  };
}

function collectTaskFields() {
  var valid = true;
  function requireField(id) {
    var val = getVal(id);
    if (!val) {
      var el = document.getElementById(id);
      if (el) el.classList.add('err');
      valid = false;
    }
    return val || null;
  }
  // Clear previous error highlights
  document.querySelectorAll('#fm-body .err').forEach(function(el) { el.classList.remove('err'); });

  var title = requireField('fm-title-val');
  var status = requireField('fm-status');
  var assignee = requireField('fm-assignee');
  var project = requireField('fm-project');
  var description = getVal('fm-description') || null;
  if (!description) {
    var descEl = document.getElementById('fm-description');
    if (descEl) descEl.classList.add('err');
    valid = false;
  }

  if (!valid) {
    showToast('Please fill in all required fields: Title, Status, Assignee, Project, and Description.', 'warn');
    return null;
  }

  return {
    title:       title,
    status:      status,
    priority:    getVal('fm-priority')   || null,
    assignee:    assignee,
    project:     project,
    tool:        getVal('fm-tool')       || null,
    category:    getVal('fm-category')   || null,
    start:       getVal('fm-start')      || null,
    due:         getVal('fm-due')        || null,
    working_due: getVal('fm-working-due')|| null,
    description: description,
    actual_end:  getVal('fm-actual-end') || null,
    resolution:  getVal('fm-resolution')|| null,
    phase_requirements: getVal('fm-phase-reqs-val') || null,
    blocked_by: isFeatureOn('dependencies') ? (function() {
      var refs = depGetCurrentRefs();
      return refs.length > 0 ? refs.join(',') : null;
    })() : undefined,
  };
}

async function handleFormSubmit(andDownload) {
  const isProject = Editor.mode.indexOf('project') >= 0;
  const isEdit    = Editor.mode.indexOf('edit')    >= 0;
  const fields    = isProject ? collectProjectFields() : collectTaskFields();
  if (!fields) return;

  // ── Business rule: project names must be unique ─────────────
  if (isProject && fields.title) {
    const duplicate = PROJECTS.find(function(p) {
      if (isEdit && p.objectId === Editor.editId) return false; // skip self when editing
      return p.title.toLowerCase() === fields.title.toLowerCase();
    });
    if (duplicate) {
      showToast('A project named "' + fields.title + '" already exists.', 'warn');
      return;
    }
  }

  // ── Business rule: Active/Scheduled projects require a size ───────────
  if (isProject && !isEdit && (fields.status === 'Active' || fields.status === 'Scheduled') && !fields.project_size) {
    showToast('Active and Scheduled projects require a Project Size (S/M/L/XL). Use the wizard if you\'re not sure.', 'warn');
    var sizeEl = document.getElementById('fm-project-size');
    if (sizeEl) { sizeEl.style.borderColor = '#EF4444'; sizeEl.focus(); }
    return;
  }

  // ── Auto-copy: Working Due Date defaults to Original End Date ──
  if (isProject && fields.end && !fields.working_due) {
    fields.working_due = fields.end;
  }

  // ── Access control: only group members can promote Ideas ──
  if (isProject && isEdit) {
    const origProject = PROJECTS.find(p => p.objectId === Editor.editId);
    if (origProject && origProject.status === 'Idea' && fields.status !== 'Idea') {
      if (!Auth.canPromote) {
        showToast('Permission denied: only authorized users can change Idea status. Contact your administrator.', 'error');
        return;
      }
    }
  }

  // ── Validate character limits ──
  var overLimit = fmCheckCharLimits();
  if (overLimit.length > 0) {
    showToast('Fields over character limit: ' + overLimit.join(', '), 'error');
    return;
  }

  // ── Business rule: Active tasks require a due date and start date ──
  if (!isProject && fields.status === 'Active') {
    if (!fields.start) {
      showToast('A start date is required for Active tasks. Please add a start date.', 'warn');
      var startEl = document.getElementById('fm-start');
      if (startEl) { startEl.style.borderColor = '#EF4444'; startEl.focus(); }
      return;
    }
    if (!fields.due && !fields.working_due) {
      showToast('A due date is required for Active tasks. Please add a due date.', 'warn');
      var dueEl = document.getElementById('fm-due');
      if (dueEl) { dueEl.style.borderColor = '#EF4444'; dueEl.focus(); }
      return;
    }
  }

  // Show saving state
  var saveBtn = document.getElementById('fm-save-btn');
  var saveBtnOrigText = saveBtn ? saveBtn.textContent : '';
  if (saveBtn) { saveBtn.textContent = 'Saving…'; saveBtn.disabled = true; saveBtn.style.opacity = '0.6'; }

  // Track status changes for task history
  if (!isProject && isFeatureOn('taskHistory')) {
    var existingTask = isEdit ? TASKS.find(function(t) { return t.objectId == Editor.editId; }) : null;
    var oldStatus = existingTask ? existingTask.status : null;
    var newFormStatus = fields.status;
    if (!isEdit || (oldStatus && newFormStatus && oldStatus !== newFormStatus)) {
      var formReason = null;
      if (needsStatusReason(newFormStatus)) {
        var formResult = await promptStatusReason(oldStatus, newFormStatus);
        if (!formResult.confirmed) {
          if (saveBtn) { saveBtn.textContent = saveBtnOrigText; saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
          return;
        }
        formReason = formResult.reason;
      }
      fields.task_status_history = appendTaskHistory(existingTask || {}, oldStatus, newFormStatus, formReason);
    }
  }

  try {
    console.log('[Save] Starting save…', isEdit ? 'edit' : 'create', isProject ? 'project' : 'task', fields);
    if (isEdit) {
      if (isProject) await DataStore.updateProject(Editor.editId, fields);
      else           await DataStore.updateTask(Editor.editId, fields);
    } else {
      const created = isProject ? await DataStore.createProject(fields) : await DataStore.createTask(fields);
      // After create: open the new record's detail view
      Editor.editId = isProject ? created.objectId : created.objectId;

      // ── Auto-fill allocations for new Active/Scheduled projects ─────────
      if (isProject && (fields.status === 'Active' || fields.status === 'Scheduled') && fields.project_size) {
        autoFillAllocationsForNewProject(fields);
      }
    }
    console.log('[Save] Save completed successfully.');
    showToast((isEdit ? 'Updated' : 'Created') + ' ' + (isProject ? 'project' : 'task') + ' successfully.', 'success');

    // Auto-add task assignee as project contributor
    if (!isProject && fields.assignee && fields.project) {
      await ensureProjectContributor(fields.project, fields.assignee);
    }
  } catch (saveErr) {
    console.error('[Save] Failed:', saveErr);
    showToast('Save failed: ' + saveErr.message, 'error');
    if (saveBtn) { saveBtn.textContent = saveBtnOrigText; saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
    return; // Don't close the form — let the user try again
  }

  closeFormModal();
  if (andDownload) { saveAllData(); }

  markDataDirty();
  render();

  // After a CREATE: open the detail view for the new record
  // After an EDIT: re-render with existing filters preserved
  if (!isEdit) {
    if (isProject && Editor.editId) openProject(Editor.editId);
    else if (!isProject && Editor.editId) {
      openTask(Editor.editId);
      // Fire AI phase suggestion if enabled, task has a project, and no phase reqs were set
      if (_aiPhaseAssignment && fields.project && !fields.phase_requirements) {
        suggestPhaseRequirements(Editor.editId);
      }
    }
  }
}

async function handleFormDelete() {
  if (!ensureValidSession(function() { handleFormDelete(); })) return;
  const isProject = Editor.mode.indexOf('project') >= 0;
  if (isProject) {
    var proj = PROJECTS.find(function(p) { return p.objectId == Editor.editId; });
    var projNum = proj && proj.project_number != null ? String(proj.project_number) : null;
    var taskCount = projNum ? TASKS.filter(function(t) { return t.project_number != null && String(t.project_number) === projNum; }).length : 0;
    var msg = 'Delete this project?';
    if (taskCount > 0) msg += '\n\nThis will also delete ' + taskCount + ' associated task(s) and all allocation records.';
    msg += '\n\nThis cannot be undone.';
    if (!confirm(msg)) return;
    await DataStore.deleteProject(Editor.editId);
  } else {
    if (!confirm('Delete this task? This cannot be undone.')) return;
    await DataStore.deleteTask(Editor.editId);
  }
  closeFormModal();
  closeModalDirect();
  markDataDirty();
  render();
}

// ── Size Wizard constants ─────────────────────────────────
const SIZE_WIZARD_QUESTIONS = [
  { label: 'Step 1 of 4', question: 'How long do you expect this project to take?',
    options: [
      { label: 'Less than 2 weeks', desc: 'Quick task or simple deliverable', score: 1 },
      { label: '2 to 8 weeks', desc: 'A few sprints or a focused effort', score: 2 },
      { label: '2 to 4 months', desc: 'Multi-phase project with milestones', score: 3 },
      { label: 'More than 4 months', desc: 'Major initiative, possibly ongoing', score: 4 }
    ] },
  { label: 'Step 2 of 4', question: 'How many people will be working on this?',
    options: [
      { label: 'Just me', desc: 'Solo effort', score: 1 },
      { label: '2 to 3 people', desc: 'Small team', score: 2 },
      { label: '4 to 6 people', desc: 'Cross-functional team', score: 3 },
      { label: '7 or more', desc: 'Large team or multiple teams', score: 4 }
    ] },
  { label: 'Step 3 of 4', question: 'How many distinct deliverables are expected?',
    options: [
      { label: '1 deliverable', desc: 'A single report, dashboard, or tool', score: 1 },
      { label: '2 to 3 deliverables', desc: 'A few related outputs', score: 2 },
      { label: '4 to 6 deliverables', desc: 'Multiple components or phases', score: 3 },
      { label: '7 or more', desc: 'Large suite of outputs or ongoing deliverables', score: 4 }
    ] },
  { label: 'Step 4 of 4', question: 'How complex is the stakeholder involvement?',
    options: [
      { label: 'Internal team only', desc: 'Just our analytics team', score: 1 },
      { label: 'One other department', desc: 'Single partner department', score: 2 },
      { label: 'Multiple departments', desc: 'Cross-departmental coordination', score: 3 },
      { label: 'External partners or vendors', desc: 'Outside organizations involved', score: 4 }
    ] }
];
const SIZE_WIZARD_MAP = [
  { key: 'S',  label: 'Small',       range: [4, 6],   desc: 'A focused effort completed quickly with minimal coordination. Typically a single deliverable handled by one or two people.' },
  { key: 'M',  label: 'Medium',      range: [7, 9],   desc: 'A moderate project requiring a few weeks of focused work and some cross-team coordination.' },
  { key: 'L',  label: 'Large',       range: [10, 12], desc: 'A significant effort spanning months with multiple deliverables, several team members, and stakeholder management.' },
  { key: 'XL', label: 'Extra large', range: [13, 16], desc: 'A major initiative requiring sustained effort from a large team over several months, often with external dependencies.' }
];
let _sizeWizardAnswers = [-1, -1, -1, -1];
let _sizeWizardStep = 0;
