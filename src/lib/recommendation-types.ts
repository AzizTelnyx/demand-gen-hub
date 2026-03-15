// Types that execute real platform changes when approved
export const EXECUTABLE_TYPES = [
  "add-negative", "add_negative",    // blocks search term via Google Ads API
  "pause_keyword", "keyword_pause",  // pauses keyword via Google Ads API
  "budget_change", "budget-realloc", "budget_increase", "budget_decrease",  // adjusts campaign budget
  "device_bid", "geo_bid",           // adjusts bid modifiers
  "community_removal",               // removes Reddit community targeting
  "frequency_cap",                   // adjusts frequency cap
  "domain_block",                    // blocks domain/publisher
  "pause_campaign",                  // pauses entire campaign
  "reallocate",                      // budget reallocation
];

// Types that are informational — user can only acknowledge, not execute
export const INFORMATIONAL_TYPES = [
  "fix_url", "url_error", "utm_warning", "utm_issue",
  "creative_fatigue", "landing_page",
  "audience_overlap", "saturation",
  "review", "audit",
];

// Types that are summary alerts — shouldn't be in approval queue
export const ALERT_TYPES = [
  "overspend_risk", "budget_rebalance_needed",
  "underspend_alert",
];

export function getActionType(type: string): 'executable' | 'informational' | 'alert' {
  const t = (type || '').toLowerCase();
  if (EXECUTABLE_TYPES.some(x => t.includes(x))) return 'executable';
  if (ALERT_TYPES.some(x => t.includes(x))) return 'alert';
  return 'informational';
}

export function getBeforeAfter(rec: { type?: string; metadata?: any; impact?: any }): { before: string; after: string } | null {
  const m = rec.metadata || rec.impact || {};
  const type = rec.type || '';

  if (type.includes('negative') || type === 'add-negative') {
    if (m.search_term) return {
      before: `Ads show for "${m.search_term}"`,
      after: `"${m.search_term}" blocked as ${m.match_type || 'exact'} negative`,
    };
  }
  if (type === 'pause_keyword' || type === 'keyword_pause') {
    const kw = m.search_term || m.keyword;
    return {
      before: kw ? `Keyword active: "${kw}"` : 'Keyword active',
      after: 'Keyword paused — no more spend',
    };
  }
  if (type.includes('budget')) {
    if (m.oldBudget != null && m.newBudget != null) return {
      before: `$${m.oldBudget}/day`,
      after: `$${m.newBudget}/day`,
    };
    if (m.old_value != null && m.new_value != null) return {
      before: `$${m.old_value}/day`,
      after: `$${m.new_value}/day`,
    };
  }
  if (type.includes('bid')) {
    if (m.old_modifier != null && m.new_modifier != null) return {
      before: `${m.old_modifier > 0 ? '+' : ''}${m.old_modifier}%`,
      after: `${m.new_modifier > 0 ? '+' : ''}${m.new_modifier}%`,
    };
  }
  if (type === 'community_removal') {
    if (m.community) return {
      before: `Targeting r/${m.community}`,
      after: `r/${m.community} removed`,
    };
  }
  if (type === 'frequency_cap') {
    if (m.old_cap != null && m.new_cap != null) return {
      before: `${m.old_cap}x frequency`,
      after: `${m.new_cap}x frequency`,
    };
  }
  if (type === 'domain_block') {
    if (m.domain) return {
      before: `Ads on ${m.domain}`,
      after: `${m.domain} blocked`,
    };
  }
  return null;
}
