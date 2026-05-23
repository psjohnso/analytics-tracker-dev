// App configuration layer — extracted from index.html on 2026-05-22.
// Classic script: the config state (mutable _custom*/_config* globals, defaults)
// and helpers below are globals shared with the rest of the app. applyAppConfig()
// overlays app_config records (loaded from AGOL) onto the code defaults; the
// _custom* lists are the live source for dropdowns/validation. The _custom*
// initializers depend on _default* (above) and FM_OWNING_TEAMS (src/constants.js),
// so this file must load after constants.js. Other refs (DATA_PROGRAM_DEFAULT_CONFIG,
// TEAM_INTRO_DEFAULT_CONFIG, RISK_DEFAULT_CONFIG, buildDescMap, refreshEnums,
// _reviewTypes, …) are resolved at call time.

let ABS_COLS = 8;

// ── Dropdown List Editor State ──────────────────────────────────
// These arrays are the "base" lists that users can edit in Settings.
// They persist to the app_config ArcGIS Online service so changes
// are shared across all users and browsers.
// mergeEnums() in getEnums() will add any values found in existing project data
// that aren't in these lists, so historical data is never lost.
const _defaultPartnerDepts = [
  'Business Services', 'City Attorney', 'City Clerk', 'City Court',
  "City Manager's Office", 'Environmental & General Services', 'Fire',
  'Housing & Community Development', 'Human Resources', 'Information Technology',
  'Mayor & Council', 'Parks & Recreation', 'Planning & Development Services',
  'Police', 'Procurement', 'Transportation & Mobility', 'Tucson Water',
  'Multiple Departments'
];
const _defaultItdTeams = [
  'Geographic Information Systems',
  'Business & Advanced Analytics',
  'Artificial Intelligence',
  'Emerging Data Infrastructure - Cloud Data Services',
  'Data Architecture',
  'Data Librarian'
];

// ObjectIds for the two config records (populated on load from ArcGIS)
const _configOids = { partner_depts: null, itd_teams: null, owning_teams: null, proj_categories: null, task_categories: null, task_tools: null, allocation_defaults: null, review_types: null, productivity_ratio: null, display_config: null, data_program: null, team_intro: null, risk_config: null, team_scoping: null };

// Slideshow / lobby-display configuration. Team-wide; admin-edited via
// Settings → System → Slideshow. Loaded by applyAppConfig() from
// app_config.display_config; falls back to hardcoded default in slideshow.js.
var _displayConfig = null;

// Data Program teams configuration (Data Intelligence, Data Architecture,
// Data Librarian, Emerging Data Infrastructure). Drives team dropdowns,
// Data Program portfolio view, slide tile labels and colors. Admin-edited
// via Settings → System → Data Program. Falls back to
// DATA_PROGRAM_DEFAULT_CONFIG (in constants.js) until loaded.
var _dataProgramConfig = null;
function getDataProgramTeams() {
  var cfg = _dataProgramConfig || DATA_PROGRAM_DEFAULT_CONFIG;
  return (cfg && Array.isArray(cfg.teams)) ? cfg.teams : DATA_PROGRAM_DEFAULT_CONFIG.teams;
}

// Team Introduction content (mission / services / goals / partners /
// about) for the Overview tab. Admin-edited via Settings → System →
// Team Introduction. Falls back to TEAM_INTRO_DEFAULT_CONFIG until
// app_config.team_intro loads.
var _teamIntroConfig = null;
function getTeamIntro() { return _teamIntroConfig || TEAM_INTRO_DEFAULT_CONFIG; }

// Productivity factor applied to per-week project capacity. Admin-tunable via Settings → Allocations.
// Default 0.75 accounts for non-project overhead (meetings, email, breaks, context-switching).
let _productivityRatio = 0.75;

// Pay period reference: 2025-12-28 is a Week A (Sunday) start.
// Every 14 days alternates A/B. Week A = week1_hours, Week B = week2_hours.
const PAY_PERIOD_REF = new Date('2025-12-28T00:00:00');
function getPayPeriodWeek(weekDateStr) {
  const d = new Date(weekDateStr + 'T00:00:00');
  const diffDays = Math.round((d - PAY_PERIOD_REF) / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(diffDays / 7);
  return (weekNum % 2 === 0) ? 'A' : 'B';
}

// Start with defaults; overwritten by applyAppConfig() after ArcGIS load
let _customPartnerDepts = [..._defaultPartnerDepts];
let _customItdTeams = [..._defaultItdTeams];
// Configurable Team (owning_team) list — edited in Settings → Dropdown lists →
// Teams, persisted as app_config.owning_teams. Single source of truth for every
// Team picker (member form, project form, review-type scope). Seeds from the
// canonical FM_OWNING_TEAMS domain until the config record loads.
let _customOwningTeams = (typeof FM_OWNING_TEAMS !== 'undefined') ? [...FM_OWNING_TEAMS] : [];

// ── Allocation Defaults by Project Size × Role ──────────────────
let _allocationDefaults = {
  S:  { Lead: 15, Contributor: 10, Reviewer: 5 },
  M:  { Lead: 25, Contributor: 15, Reviewer: 5 },
  L:  { Lead: 40, Contributor: 20, Reviewer: 10 },
  XL: { Lead: 50, Contributor: 30, Reviewer: 10 }
};

// Category and tool lists: arrays of {name, desc} objects
let _customProjCategories = [
  {name:'AI Enablement, Automation & Machine Intelligence', desc:'Leveraging AI, machine learning, or automation to improve city operations and decision-making.'},
  {name:'Application Update & Enhancement', desc:'Maintenance, upgrades, and feature additions to existing applications and tools.'},
  {name:'Data Analysis, Reporting & Insights', desc:'Analyzing city data to produce reports, dashboards, visualizations, or actionable insights.'},
  {name:'Data Governance, Compliance & Policy', desc:'Standards, policies, and procedures for data quality, security, access, and compliance.'},
  {name:'Data Processing, Integration & Engineering', desc:'Data pipelines, ETL processes, database design, and integrations between city systems.'},
  {name:'Documentation & Knowledge Management', desc:'Technical documentation, SOPs, knowledge bases, and institutional knowledge resources.'},
  {name:'Enterprise Administration & Platform Management', desc:'Administering shared platforms, licenses, user accounts, and enterprise software systems.'},
  {name:'Infrastructure Modernization & Platform Migration', desc:'Upgrading, replacing, or migrating legacy systems to modern architectures and cloud services.'},
  {name:'Interdepartmental Consulting & Support', desc:'Providing data, GIS, or analytics expertise to other city departments for their initiatives.'},
  {name:'Multi-Application Workflow Development', desc:'Integrated workflows and cross-system processes spanning multiple tools or platforms.'},
  {name:'Operational Support & Sustainment Activities', desc:'Ongoing maintenance, monitoring, troubleshooting, and support for production systems.'},
  {name:'Public Engagement & Open Data', desc:'Publishing city data, building community-facing tools, story maps, and open data portals.'},
  {name:'Spatial Data Services & GIS Product Development', desc:'Building and maintaining GIS maps, spatial datasets, web mapping apps, and location services.'},
  {name:'Strategic Planning & Architecture', desc:'Long-range planning, technology roadmaps, solution architecture, and strategic initiatives.'},
  {name:'Training, Enablement & Community', desc:'Training programs, workshops, user enablement, and fostering user communities.'},
  {name:'Other', desc:'Work that doesn\'t fit neatly into any existing category. Consider suggesting a new category if this is used frequently.'},
];
let _customTaskCategories = [
  {name:'AI & Machine Learning', desc:'Model training, prompt engineering, ML pipelines, AI integration, and evaluation.'},
  {name:'Application Development', desc:'Building new apps — Experience Builder, Hub, Survey123, dashboards, or custom tools.'},
  {name:'Application Maintenance', desc:'Reconfiguring, updating, patching, or fixing existing production applications.'},
  {name:'Automation & Scripting', desc:'Python scripts, Power Automate flows, FME workbenches, and scheduled automation jobs.'},
  {name:'Code Review & QA', desc:'Reviewing others\' work, peer testing, quality assurance, and validation.'},
  {name:'Data Discovery & Profiling', desc:'Exploring new data sources, assessing data quality, profiling, and cataloging.'},
  {name:'Data Engineering', desc:'ETL pipelines, data transformations, schema design, and system integrations.'},
  {name:'Data Maintenance', desc:'Routine data updates, corrections, ongoing data stewardship, and data hygiene.'},
  {name:'Data Visualization & Reporting', desc:'Building dashboards, reports, charts, Power BI content, and StoryMaps.'},
  {name:'Deployment & Release', desc:'Publishing apps to production, promoting builds, and release management.'},
  {name:'Documentation', desc:'Technical docs, SOPs, knowledge base articles, process documentation, and policies.'},
  {name:'Geospatial Analysis', desc:'Spatial queries, geocoding, network analysis, geoprocessing, and map production.'},
  {name:'Infrastructure & Server Management', desc:'Server builds, software installs/updates, platform admin, and environment setup.'},
  {name:'Meeting & Collaboration', desc:'Team meetings, stakeholder sessions, cross-department coordination, and standups.'},
  {name:'Professional Development', desc:'Training you take, certifications, conferences, courses, and self-directed learning.'},
  {name:'Project Planning & Scoping', desc:'Requirements gathering, estimating, writing scope docs, and project setup.'},
  {name:'Research & Prototyping', desc:'Evaluating tools or approaches, proof of concept work, and pilot builds.'},
  {name:'Security & Compliance', desc:'Access management, security audits, ADA compliance, and data governance tasks.'},
  {name:'Statistical Analysis', desc:'Statistical modeling, trend analysis, forecasting, and quantitative research.'},
  {name:'Stakeholder Support', desc:'Answering user questions, ad-hoc data requests, and general user assistance.'},
  {name:'Troubleshooting', desc:'Debugging, incident response, diagnosing issues, and root cause analysis.'},
  {name:'User Training & Enablement', desc:'Training others, creating training materials, onboarding users, and demos.'},
  {name:'Other', desc:'Work that doesn\'t fit neatly into any existing category. Consider suggesting a new category if this is used frequently.'},
];
let _customTaskTools = [
  {name:'AI Assistant (ChatGPT/Claude/Copilot)', desc:'AI-powered assistants for code generation, analysis, writing, and problem-solving.', active:true},
  {name:'Alation', desc:'Data catalog and governance platform for discovering and documenting data assets.', active:true},
  {name:'ArcGIS Dashboard', desc:'Real-time operational dashboards with maps, charts, and indicators.', active:true},
  {name:'ArcGIS Enterprise', desc:'On-premises GIS platform for hosting maps, services, and spatial data.', active:true},
  {name:'ArcGIS Experience Builder', desc:'Configurable web apps with maps, data, and interactive widgets.', active:true},
  {name:'ArcGIS Field Maps', desc:'Mobile data collection and field work management (includes legacy Workforce).', active:true},
  {name:'ArcGIS Hub Site', desc:'Community engagement sites for sharing data, maps, and initiatives.', active:true},
  {name:'ArcGIS Instant Apps', desc:'Quick, focused web apps built from templates with minimal configuration.', active:true},
  {name:'ArcGIS Online', desc:'Cloud-based GIS for creating, managing, and sharing maps and spatial data.', active:true},
  {name:'ArcGIS Pro', desc:'Desktop GIS application for advanced mapping, analysis, and data management.', active:true},
  {name:'ArcGIS Python API (arcpy/arcgis)', desc:'Python libraries for scripting GIS workflows, automation, and spatial analysis.', active:true},
  {name:'ArcGIS Server', desc:'Server-based GIS services — map, feature, geoprocessing, and image services.', active:true},
  {name:'ArcGIS StoryMap', desc:'Narrative-driven web apps combining maps, text, images, and multimedia.', active:true},
  {name:'ArcGIS Survey123', desc:'Form-based mobile and web data collection with smart form logic.', active:true},
  {name:'ArcMap (Desktop)', desc:'Legacy desktop GIS application — predecessor to ArcGIS Pro.', active:true},
  {name:'Azure / Cloud Services', desc:'Microsoft Azure or other cloud platforms for hosting, compute, and storage.', active:true},
  {name:'Docker', desc:'Containerization platform for packaging and deploying applications.', active:true},
  {name:'Excel', desc:'Spreadsheet tool for data analysis, tabular data, and quick calculations.', active:true},
  {name:'FME', desc:'Spatial ETL platform for data transformation and integration between systems.', active:true},
  {name:'Geocortex / VertiGIS', desc:'Extended GIS web and mobile applications built on ArcGIS technology.', active:true},
  {name:'Git / GitHub', desc:'Version control and code collaboration platform.', active:true},
  {name:'Jupyter / Notebooks', desc:'Interactive computing environment for data science and analysis.', active:true},
  {name:'Microsoft Forms', desc:'Simple form builder for surveys, quizzes, and data collection.', active:true},
  {name:'Microsoft Teams', desc:'Collaboration platform for chat, meetings, and file sharing.', active:true},
  {name:'Power Automate', desc:'Workflow automation connecting apps, services, and data sources.', active:true},
  {name:'Power BI', desc:'Business intelligence — dashboards, reports, and data visualization.', active:true},
  {name:'PowerPoint', desc:'Presentation tool for slide decks and visual communications.', active:true},
  {name:'PowerShell', desc:'Command-line scripting for system administration and automation.', active:true},
  {name:'Python', desc:'General-purpose programming language for scripting, analysis, and automation.', active:true},
  {name:'Qlik', desc:'Data analytics and visualization platform for interactive dashboards.', active:true},
  {name:'SharePoint', desc:'Document management and intranet collaboration platform.', active:true},
  {name:'Smartsheet', desc:'Work management platform for project tracking and collaboration.', active:true},
  {name:'Snowflake', desc:'Cloud data warehouse for storing, querying, and sharing structured data.', active:true},
  {name:'SQL (Various Tools)', desc:'Database querying — SSMS, pgAdmin, DBeaver, or other SQL clients.', active:true},
  {name:'TimeXtender', desc:'Data integration and automation platform for building data estates.', active:true},
  {name:'Word', desc:'Document authoring for reports, memos, and written deliverables.', active:true},
  {name:'Other', desc:'A tool not listed here. Consider requesting it be added to the list.', active:true},
];

// Helper: build description map from {name,desc} array
function buildDescMap(arr) { var m = {}; arr.forEach(function(i) { m[i.name] = i.desc; }); return m; }

// Compact storage: save with short keys (n/d/a) to fit within 4000-char field limit
function compressDescList(arr) {
  return arr.map(function(i) {
    const o = { n: i.name, d: i.desc };
    if (i.active === false) o.a = false;
    return o;
  });
}
// Expand from short keys back to full names on load
function expandDescList(arr) {
  return arr.map(function(i) {
    if (i.name !== undefined) return i; // already expanded
    return { name: i.n || '', desc: i.d || '', active: i.a !== false };
  });
}

// Called after loading config features from ArcGIS Online
function applyAppConfig(features) {
  if (!features || !features.length) return;
  features.forEach(function(f) {
    const a = f.attributes;
    const key = a.config_key;
    const val = a.config_value;
    const oid = a.ObjectId || a.OBJECTID || a.objectid;
    if (!key || !val) return;
    try {
      const parsed = JSON.parse(val);
      if (key === 'allocation_defaults') {
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          _allocationDefaults = parsed;
          _configOids.allocation_defaults = oid;
          console.log('[Config] Loaded allocation_defaults:', JSON.stringify(parsed));
        }
        return;
      }
      if (key === 'ai_phase_assignment') {
        _aiPhaseAssignment = !!parsed;
        _configOids.ai_phase_assignment = oid;
        console.log('[Config] Loaded ai_phase_assignment:', _aiPhaseAssignment);
        return;
      }
      if (key === 'productivity_ratio') {
        var n = (typeof parsed === 'number') ? parsed : parseFloat(parsed);
        if (!isNaN(n) && n > 0 && n <= 1) {
          _productivityRatio = n;
          _configOids.productivity_ratio = oid;
          console.log('[Config] Loaded productivity_ratio:', _productivityRatio);
        }
        return;
      }
      if (key === 'display_config') {
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.slides)) {
          _displayConfig = parsed;
          _configOids.display_config = oid;
          console.log('[Config] Loaded display_config:', parsed.slides.length, 'slides');
        }
        return;
      }
      if (key === 'data_program') {
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.teams)) {
          _dataProgramConfig = parsed;
          _configOids.data_program = oid;
          console.log('[Config] Loaded data_program:', parsed.teams.length, 'teams');
        }
        return;
      }
      if (key === 'team_intro') {
        if (parsed && typeof parsed === 'object') {
          _teamIntroConfig = parsed;
          _configOids.team_intro = oid;
          console.log('[Config] Loaded team_intro');
        }
        return;
      }
      if (key === 'risk_config') {
        if (parsed && typeof parsed === 'object' && typeof applyRiskConfig === 'function') {
          applyRiskConfig(parsed);
          _configOids.risk_config = oid;
          console.log('[Config] Loaded risk_config');
        }
        return;
      }
      if (key === 'team_scoping') {
        // Multi-team rollout switch. Accepts { enabled, home_team } or a bare boolean.
        // _teamScopingEnabled / HOME_TEAM live in src/team-scope.js.
        if (typeof _teamScopingEnabled !== 'undefined') {
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            _teamScopingEnabled = !!parsed.enabled;
            if (parsed.home_team && typeof parsed.home_team === 'string' && parsed.home_team.trim()) {
              HOME_TEAM = parsed.home_team.trim();
            }
          } else {
            _teamScopingEnabled = !!parsed;
          }
          _configOids.team_scoping = oid;
          console.log('[Config] Loaded team_scoping: enabled =', _teamScopingEnabled, '| home_team =', (typeof HOME_TEAM !== 'undefined' ? HOME_TEAM : '(unset)'));
        }
        return;
      }
      if (!Array.isArray(parsed)) return;
      if (key === 'partner_depts') {
        _customPartnerDepts = parsed;
        _configOids.partner_depts = oid;
      } else if (key === 'itd_teams') {
        _customItdTeams = parsed;
        _configOids.itd_teams = oid;
      } else if (key === 'owning_teams') {
        _customOwningTeams = parsed;
        _configOids.owning_teams = oid;
      } else if (key === 'review_types') {
        _reviewTypes = parsed;
        _configOids.review_types = oid;
        // Migration: bring the seeded review types' filters up to current defaults.
        // Persists in-memory only; next admin save writes it back to ArcGIS.
        var dataTeamRt = _reviewTypes.find(function(rt) { return rt.id === 'data-team'; });
        if (dataTeamRt && dataTeamRt.filter) {
          if (dataTeamRt.filter.require_data_program == null) dataTeamRt.filter.require_data_program = true;
          if (dataTeamRt.filter.group_by_quarter == null) dataTeamRt.filter.group_by_quarter = true;
          if (!Array.isArray(dataTeamRt.filter.default_statuses)) dataTeamRt.filter.default_statuses = ['Active', 'Scheduled', 'On Hold', 'Future'];
        }
        var dataIntelRt = _reviewTypes.find(function(rt) { return rt.id === 'data-intel'; });
        if (dataIntelRt && dataIntelRt.filter) {
          if (dataIntelRt.filter.review_mode == null) dataIntelRt.filter.review_mode = 'task';
          if (!Array.isArray(dataIntelRt.filter.default_statuses)) dataIntelRt.filter.default_statuses = ['Active', 'On Hold', 'Waiting for Response'];
        }
      } else if (key === 'proj_categories') {
        if (parsed.length && typeof parsed[0] === 'object') _customProjCategories = expandDescList(parsed);
        _configOids.proj_categories = oid;
      } else if (key === 'task_categories') {
        if (parsed.length && typeof parsed[0] === 'object') _customTaskCategories = expandDescList(parsed);
        _configOids.task_categories = oid;
      } else if (key === 'task_tools') {
        if (parsed.length && typeof parsed[0] === 'object') _customTaskTools = expandDescList(parsed);
        _configOids.task_tools = oid;
      }
    } catch (e) {
      console.warn('Could not parse config value for key:', key, e);
    }
  });
  // Refresh enum aliases so dropdowns reflect loaded config
  if (typeof refreshEnums === 'function') refreshEnums();
  console.log('[Config] Loaded:', _customPartnerDepts.length, 'depts,', _customItdTeams.length, 'teams,',
    _configOids.proj_categories ? 'proj_cats' : 'no proj_cats,',
    _configOids.task_categories ? 'task_cats' : 'no task_cats,',
    _configOids.task_tools ? 'task_tools' : 'no task_tools');
}
