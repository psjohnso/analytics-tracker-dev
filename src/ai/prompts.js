// ─────────────────────────────────────────────────────────────────────
// ai/prompts.js — AI infrastructure: proxy URL, model, per-feature
// max-tokens, and a shared callAiProxy() wrapper.
//
// The prompts themselves stay where they're built — they're highly
// dynamic (project context, lifecycle phases, configurable enums) and
// extracting them into static templates would create more friction
// than it saves. What this file centralizes:
//
//   - AI_MODEL            → upgrade Claude versions in one place
//   - AI_PROMPTS[key]     → per-feature max_tokens
//   - callAiProxy(...)    → shared fetch + error handling + text join
//
// Each call site builds its prompt, calls callAiProxy(key, prompt),
// and parses the returned text per its own response shape.
// ─────────────────────────────────────────────────────────────────────

// Cloudflare Worker proxy that fronts the Anthropic API.
// See WORKER_SETUP_GUIDE.md.
const AI_PROXY_URL = 'https://analytics-tracker-proxy.psjohnso.workers.dev';

// Single source of truth for the Claude model. Bump here when a new
// version ships and you've validated it across all features below.
const AI_MODEL = 'claude-sonnet-4-20250514';

// Per-feature configuration. Each key matches a call site.
// Sized empirically — task suggestions need the most headroom because
// they emit ~15-25 tasks with descriptions; phase assignment is a
// tiny JSON object so 300 tokens is plenty.
const AI_PROMPTS = {
  taskSuggest:      { maxTokens: 12000 }, // suggestTasksForProject
  phaseAssign:      { maxTokens: 300 },   // suggestPhaseRequirements
  alignmentSuggest: { maxTokens: 4000 },  // suggestAlignment
  intakeQuestions:  { maxTokens: 1000 },  // openGuidedIdeaForm — follow-up Q's
  intakeSummary:    { maxTokens: 1500 },  // openGuidedIdeaForm — final summary
};

// Unified call wrapper. Returns the assistant's text content (joined
// across content blocks). Throws on proxy misconfig or API error.
async function callAiProxy(promptKey, userPrompt) {
  var config = AI_PROMPTS[promptKey];
  if (!config) throw new Error('Unknown AI prompt key: ' + promptKey);

  if (!AI_PROXY_URL || AI_PROXY_URL.indexOf('YOUR_SUBDOMAIN') >= 0) {
    throw new Error('AI proxy not configured. See WORKER_SETUP_GUIDE.md.');
  }

  var response = await fetch(AI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: config.maxTokens,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  var data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }

  return (data.content || []).map(function(c) { return c.text || ''; }).join('');
}
