// ─────────────────────────────────────────────────────────────────────
// constants.js — application-wide literal constants
//
// Pure data. No references to runtime state (Auth, PROJECTS, etc.) or
// external functions. Loaded after util.js but before everything else
// so any module can reference these values.
//
// NOTE: Values pulled from app_config (FM_PROJ_CATEGORIES,
// FM_TASK_CATEGORIES, FM_PROJ_STATUSES, etc.) are NOT here — they're
// initialized at runtime by applyAppConfig() and stay in index.html.
// ─────────────────────────────────────────────────────────────────────

const APP_VERSION = '1.15.0.0004';

// ══════════════════════════════════════════════════════════════════════
//  ACTIVE PROJECT LIFECYCLE PHASES
// ══════════════════════════════════════════════════════════════════════
const LIFECYCLE_PHASES = [
  { id: 0, name: 'Not started', shortName: 'Not started', defaultDuration: '—', requirements: [
    { id: 'P0_SPONSOR', label: 'Sponsor approval received' },
    { id: 'P0_RESOURCES', label: 'Resources identified and available' },
    { id: 'P0_TIMELINE', label: 'Timeline and milestones defined' }
  ]},
  { id: 1, name: 'Kickoff & discovery', shortName: 'Kickoff', defaultDuration: '2 days', requirements: [
    { id: 'P1_GOALS', label: 'Goals and success criteria documented' },
    { id: 'P1_STAKEHOLDERS', label: 'Stakeholders, sponsor, and data owners identified' },
    { id: 'P1_BACKLOG', label: 'Requirements/backlog created and prioritized' }
  ]},
  { id: 2, name: 'Data readiness & preparation', shortName: 'Data prep', defaultDuration: '3 weeks', requirements: [
    { id: 'P2_DATA_ACCESS', label: 'Data sources located and access secured' },
    { id: 'P2_QUALITY', label: 'Data quality assessed and approved' },
    { id: 'P2_MODEL', label: 'Initial data model/structure created' },
    { id: 'P2_VALIDATED', label: 'Stakeholders validated the data foundation' }
  ]},
  { id: 3, name: 'Iterative build & development', shortName: 'Build', defaultDuration: '2 weeks', requirements: [
    { id: 'P3_PROTOTYPE', label: 'Prototype or working version created' },
    { id: 'P3_FEATURES', label: 'Prioritized features functional' },
    { id: 'P3_DEMOS', label: 'Stakeholder demos conducted' },
    { id: 'P3_FEEDBACK', label: 'Feedback incorporated into build' }
  ]},
  { id: 4, name: 'Pre-finalization & internal QA', shortName: 'QA', defaultDuration: '2 days', requirements: [
    { id: 'P4_SCOPE_FROZEN', label: 'Scope and features frozen' },
    { id: 'P4_QA', label: 'QA completed (accuracy, security, performance)' },
    { id: 'P4_GOVERNANCE', label: 'Governance compliance confirmed' },
    { id: 'P4_DOCS_DRAFT', label: 'Draft documentation prepared' }
  ]},
  { id: 5, name: 'Design review — gate check', shortName: 'Design review', defaultDuration: '2 weeks', isGateCheck: true, requirements: [
    { id: 'P5_STANDARDS', label: 'Meets City standards for design, usability, accessibility (ADA)' },
    { id: 'P5_DATA_VALID', label: 'Data outputs validated and governance compliant' },
    { id: 'P5_SECURITY', label: 'Security and privacy addressed' },
    { id: 'P5_AUDIENCE', label: 'Appropriate for intended audience' },
    { id: 'P5_DOCS_CLEAR', label: 'Documentation clear for stakeholders' },
    { id: 'P5_ISSUES', label: 'Outstanding issues minor and resolution plan in place' }
  ]},
  { id: 6, name: 'Partner final review', shortName: 'Partner review', defaultDuration: '1 week', requirements: [
    { id: 'P6_STAKEHOLDERS', label: 'Stakeholders validated requirements are met' },
    { id: 'P6_FEEDBACK', label: 'Feedback incorporated' },
    { id: 'P6_DOCS_FINAL', label: 'Documentation finalized and approved' }
  ]},
  { id: 7, name: 'Launch & communication', shortName: 'Launch', defaultDuration: '2 days', requirements: [
    { id: 'P7_DEPLOYED', label: 'Solution deployed to production' },
    { id: 'P7_ACCESS', label: 'Access and security configured' },
    { id: 'P7_MONITORING', label: 'Monitoring enabled' },
    { id: 'P7_COMMS', label: 'Launch communications delivered' },
    { id: 'P7_TRAINING', label: 'Training or usage guidance provided' }
  ]},
  { id: 8, name: 'User acceptance', shortName: 'Acceptance', defaultDuration: '1 week', requirements: [
    { id: 'P8_EVAL', label: 'Evaluation period completed' },
    { id: 'P8_TESTED', label: 'Users tested solution in real-world conditions' },
    { id: 'P8_CAPABILITIES', label: 'All in-scope capabilities function as expected' },
    { id: 'P8_ISSUES', label: 'Issues tracked and corrective actions defined' }
  ]},
  { id: 9, name: 'Closeout & continuous improvement', shortName: 'Closeout', defaultDuration: '2 days', requirements: [
    { id: 'P9_LESSONS', label: 'Lessons learned documented' },
    { id: 'P9_OWNERSHIP', label: 'Ongoing ownership and maintenance confirmed' },
    { id: 'P9_FEEDBACK_LOOP', label: 'Feedback loop established' },
    { id: 'P9_UPDATE_CYCLE', label: 'Update cycle/process defined' }
  ]}
];

var REQUIREMENT_LOOKUP = {};
LIFECYCLE_PHASES.forEach(function(phase) {
  phase.requirements.forEach(function(req) {
    REQUIREMENT_LOOKUP[req.id] = { phaseId: phase.id, phaseName: phase.name, label: req.label };
  });
});

// Users allowed to edit Data Program, IT Initiative, DP Goal, WWC Practice/Criteria fields
const STRATEGIC_ALIGNMENT_EDITORS = ['Peter Johnson'];

// Color palette for project allocation rows in the Resources view
const PROJECT_COLORS = [
  '#C24200','#002669','#83AC16','#0088FF','#9E0059','#E5A500',
  '#4A90D9','#7B4F9E','#2D9B6E','#D4476B','#5B6EAE','#B5890A',
  '#E85D04','#3A86FF','#6A0572','#1B998B'
];

// Registry of beta-eligible features (shown in Preferences when flag === 'beta')
var BETA_FEATURES = {
  dependencies:  { flag: 'FEATURE_DEPENDENCIES',  label: 'Task Dependencies', desc: 'Track dependencies across tasks and projects. Search and add tasks from any project or entire projects as dependencies. Shows dependency icons, blocked indicators on timeline, and resolved/unresolved status on detail pages.' },
  taskHistory:   { flag: 'FEATURE_TASK_HISTORY',   label: 'Notes & Status History', desc: 'Add notes to tasks and automatically track status changes with optional reasons for On Hold, Waiting, and Canceled transitions.' },
  aiIntake:      { flag: 'FEATURE_AI_INTAKE',      label: 'AI-Guided Project Intake', desc: 'Replace the standard idea form with a guided intake that asks starter questions, generates smart follow-up questions based on your responses, and produces an AI-written project summary for reviewers.' },
  projectReview: { flag: 'FEATURE_PROJECT_REVIEW', label: 'Project Review', desc: 'Recurring portfolio review tab — walk through projects with the people assigned, log notes/decisions/action items per cycle. Configurable review types (e.g., Data Intelligence weekly, Data Team biweekly).' },
};

// ── Project / task form option lists ─────────────────────────────────
const FM_DELIVERABLE_OPTIONS = [
  'Dashboard', 'Dataset', 'Web Application', 'Report', 'Map / Web Map',
  'ETL Pipeline', 'API / Service', 'Documentation', 'Training / Curriculum',
  'Analysis / Study', 'Script / Automation', 'Data Model', 'Integration',
  'Policy / Framework', 'Template / Theme', 'Catalog / Inventory',
  'Server / Infrastructure', 'Other'
];

// ── Strategic Alignment Options ──────────────────────────────────────
const FM_IT_INITIATIVES = [
  'None',
  '3.3.1 — Assess current state of data management',
  '3.3.2 — Data governance framework',
  '3.3.3 — Evaluate data analytics tools & platforms',
  '3.3.4 — Data controls for retention & destruction',
  '3.3.5 — Pilot data analytics solutions'
];
const FM_CITY_INITIATIVES = ['None', 'Asset Scorecard', 'CMO Dashboard', 'Prosperity Initiative', 'Safe City Initiative'];
const FM_IT_PRIORITY_PROJECTS = ['None', 'AI Deployment and Responsible Use', 'BISC', 'Dashboard Standards', 'Developer and Coding Standards'];
const FM_DP_GOALS = [
  'None',
  'Gather Business Needs', 'Establish Data Governance', 'Enhance Data Quality and Accessibility',
  'Strengthen Data Security', 'Build Data Literacy and Culture', 'Implementing Scalable Architecture and Technology'
];
const FM_WWC_PRACTICES = [
  'None',
  'Community Impact', 'Data Management', 'Data-Driven Budget and Finance', 'Evaluations',
  'Leadership and Capacity', 'Open Data', 'Performance and Analytics', 'Results-Driven Contracting'
];
const FM_WWC_CRITERIA = [
  'CI1 Community Data Training and Collaboration', 'CI2 Analytics Service Delivery', 'CI3 Promotion of Data and Evidence',
  'DM1 Implementing Data Strategy and Governance', 'DM2 Maintaining a Comprehensive Data Inventory', 'DM3 Sharing Data',
  'DM4 Improving Data Quality', 'DM5 Protecting Data Privacy and Confidentiality', 'DM6 Managing Data Security',
  'DM7 Qualitative Data Practices', 'DM8 Disaggregated Data Decision-Making', 'DM9 Data Service Standard',
  'BF1 Data-Driven Budget and Financial Processes', 'BF2 Data-Driven Budget and Financial Decisions', 'BF3 Leveraging Funds for Outcomes',
  'EVAL1 Establishing City-Wide Evaluation Commitments', 'EVAL2 Launching Rigorous Evaluations',
  'EVAL3 Using Rigorous Evaluation Results to Make Decisions', 'EVAL4 Adapting Evidence-Based Programs',
  'LC1 Executive Commitment to Data Informed Government', 'LC2 Use of Public Communications',
  'LC3 Data Workforce Culture and Trainings', 'LC4 Performance Management Leadership',
  'LC5 Data Leadership', 'LC6 Rigorous Evaluation Leadership & Expertise', 'LC7 Results-Driven Contracting Leadership',
  'OD1 Open Data Policy', 'OD2 User Guidance for Open and Shared Data', 'OD3 Open Data Portal', 'OD4 User Insights About Open and Shared Data',
  'PA1 Selecting and Using Performance Metrics for Strategic Goals and Priorities', 'PA2 Implementing Performance Management',
  'PA3 Sharing Goals and Progress', 'PA4 Evaluating Disparate Impact of Automated Decisions', 'PA5 Using Analysis in Decisions',
  'RDC1 Defining Goals for Key Procurements', 'RDC2 Measuring Outcomes for Key Procurements', 'RDC3 Assessing Vendor Performance',
  'RDC4 Structuring Procurements to Support Strategic Goals', 'RDC5 Using Data to Manage Contracts and Improve Outcomes and Performance',
  'RDC6 Making Informed Contracting Decisions', 'RDC7 Open and Shared Procurement Data', 'RDC8 Supporting Vendor Participation and Competition'
];

var WWC_CRITERIA_GROUPS = [
  { prefix: 'CI', label: 'Community impact', items: FM_WWC_CRITERIA.filter(function(c) { return c.indexOf('CI') === 0; }) },
  { prefix: 'DM', label: 'Data management', items: FM_WWC_CRITERIA.filter(function(c) { return c.indexOf('DM') === 0; }) },
  { prefix: 'BF', label: 'Budget and finance', items: FM_WWC_CRITERIA.filter(function(c) { return c.indexOf('BF') === 0; }) },
  { prefix: 'EVAL', label: 'Evaluations', items: FM_WWC_CRITERIA.filter(function(c) { return c.indexOf('EVAL') === 0; }) },
  { prefix: 'LC', label: 'Leadership and capacity', items: FM_WWC_CRITERIA.filter(function(c) { return c.indexOf('LC') === 0; }) },
  { prefix: 'OD', label: 'Open data', items: FM_WWC_CRITERIA.filter(function(c) { return c.indexOf('OD') === 0; }) },
  { prefix: 'PA', label: 'Performance and analytics', items: FM_WWC_CRITERIA.filter(function(c) { return c.indexOf('PA') === 0; }) },
  { prefix: 'RDC', label: 'Results-driven contracting', items: FM_WWC_CRITERIA.filter(function(c) { return c.indexOf('RDC') === 0; }) }
];
