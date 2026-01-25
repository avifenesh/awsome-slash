# Prioritization Framework Reference

> Deep reference for priority calculation. Load when needing scoring logic.

## Priority Calculation Function

```javascript
function calculatePriority(item, weights) {
  let score = 0;

  // Severity base score
  const severityScores = {
    critical: 15,
    high: 10,
    medium: 5,
    low: 2
  };
  score += severityScores[item.severity] || 5;

  // Category multiplier
  const categoryWeights = {
    security: 2.0,    // Security issues get 2x
    bugs: 1.5,        // Bugs get 1.5x
    infrastructure: 1.3,
    features: 1.0,
    documentation: 0.8
  };
  score *= categoryWeights[item.category] || 1.0;

  // Recency boost
  if (item.createdRecently) score *= 1.2;

  // Stale penalty (old items slightly deprioritized)
  if (item.daysStale > 180) score *= 0.9;

  return Math.round(score);
}
```

## Time Bucket Thresholds

| Bucket | Criteria | Max Items | Typical Effort |
|--------|----------|-----------|----------------|
| Immediate | severity=critical OR priority >= 15 | 5 | Hours to 1 day |
| Short-term | severity=high OR priority >= 10 | 10 | 1 day to 1 week |
| Medium-term | priority >= 5 | 15 | 1-4 weeks |
| Backlog | everything else | 20 | When bandwidth allows |

## Default Priority Weights

```yaml
security: 10     # Security issues always top priority - user trust
bugs: 8          # Bugs affect users directly - visible impact
features: 5      # New functionality - growth potential
tech-debt: 4     # Keeps codebase healthy - velocity impact
documentation: 3 # Important but not urgent - onboarding impact
```

## Priority Reasoning

Don't just sort by severity - reason about context:

### Questions to Consider

1. **Does this security issue have a workaround?**
   - No workaround = higher priority
   - Easy workaround = can be medium-term

2. **Does this bug block other work?**
   - Blocker = immediate
   - Isolated = lower priority

3. **Is this feature already partially implemented?**
   - 80% done = quick win
   - 0% done = needs planning

4. **Will fixing this unlock multiple other tasks?**
   - Dependency for 3+ items = priority boost
   - Leaf node = normal priority

5. **Is this a quick win or major effort?**
   - < 1 hour + high impact = immediate
   - > 1 week + low impact = backlog

## Blocker Identification

An item is a **blocker** if:
- Other items explicitly depend on it
- It's a security issue with no workaround
- It prevents testing or deployment
- It blocks user access to core features

## Quick Win Identification

An item is a **quick win** if:
- Estimated effort < 2 hours
- Impact is visible to users
- No dependencies on other work
- Already has clear solution
