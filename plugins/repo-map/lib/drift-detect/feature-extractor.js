/**
 * Documentation feature extractor
 *
 * @module lib/drift-detect/feature-extractor
 */

'use strict';

const {
  FEATURE_SECTION_PATTERNS,
  NON_FEATURE_SECTION_PATTERNS,
  CATEGORY_SECTION_PATTERNS,
  STOPWORDS,
  FEATURE_BULLET_KEYWORDS
} = require('./feature-lexicon');
const {
  DESCRIPTIVE_HINTS,
  GENERIC_LABELS,
  LOW_SIGNAL_EXACT,
  LOW_SIGNAL_PREFIXES,
  LOW_SIGNAL_CONTAINS,
  LOW_SIGNAL_REGEX,
  PLAN_NOISE_EXACT,
  PLAN_NOISE_PREFIXES
} = require('./feature-rules');

const DEFAULT_OPTIONS = {
  maxPerFile: 20,
  maxTotal: 60,
  minLength: 4,
  maxLength: 120
};

const ALLOWED_SINGLE_TOKENS = new Set([
  'API', 'SDK', 'CLI', 'TLS', 'SSL', 'JWT', 'OIDC', 'SAML', 'SSO', 'MFA',
  'HTTP', 'HTTPS', 'GRPC', 'REST', 'GRAPHQL', 'UI', 'UX', 'SQL', 'S3'
]);

const SHORT_TOKENS = new Set([
  'az', 'js', 'ts', 'ui', 'ux', 'ai', 'ml', 'db', 'io'
]);

function extractFeaturesFromDocs(documents = [], options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const results = [];

  for (const doc of documents) {
    if (!doc || !doc.content || !doc.path) continue;
    const pathFeatures = deriveFeaturesFromPath(doc.path);
    for (const feature of pathFeatures) {
      const record = buildFeatureRecord(feature, doc.path, 1, `path:${doc.path}`, opts);
      if (record) {
        results.push(record);
        if (results.length >= opts.maxTotal) break;
      }
    }
    if (results.length >= opts.maxTotal) break;
    const extracted = extractFeaturesFromContent(doc.content, doc.path, opts);
    for (const item of extracted) {
      results.push(item);
      if (results.length >= opts.maxTotal) break;
    }
    if (results.length >= opts.maxTotal) break;
  }

  const deduped = dedupeFeatures(results);
  const names = deduped.map(item => item.name);

  return {
    features: names,
    details: deduped
  };
}

function normalizeDocLines(rawLines, filePath) {
  const normalized = String(filePath || '').toLowerCase();
  if (normalized.endsWith('.adoc') || normalized.endsWith('.asciidoc')) {
    const lines = [];
    for (let i = 0; i < rawLines.length; i += 1) {
      const line = rawLines[i];
      const trimmed = String(line || '').trim();
      if (!trimmed) {
        lines.push(line);
        continue;
      }
      if (trimmed.startsWith(':') || trimmed.startsWith('//')) continue;
      const headingMatch = trimmed.match(/^(=+)\s+(.+)$/);
      if (headingMatch) {
        const level = Math.min(6, headingMatch[1].length);
        const title = headingMatch[2].trim();
        lines.push(`${'#'.repeat(Math.max(1, level))} ${title}`);
        continue;
      }
      lines.push(line);
    }
    return lines;
  }
  if (!normalized.endsWith('.rst')) return rawLines;
  const lines = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    const next = rawLines[i + 1];
    const trimmed = String(line || '').trim();
    if (next) {
      const nextTrimmed = String(next || '').trim();
      if (trimmed && /^[=\\-~`^:+#*]{3,}$/.test(nextTrimmed) && nextTrimmed.length >= trimmed.length) {
        lines.push(`## ${trimmed}`);
        i += 1;
        continue;
      }
    }
    if (/^\\.\\.\s+/.test(trimmed)) continue;
    lines.push(line);
  }
  return lines;
}

function extractFeaturesFromContent(content, filePath, options) {
  const rawLines = String(content || '').split(/\r?\n/);
  const preparedLines = normalizeDocLines(rawLines, filePath);
  const lines = [];
  let quoteBuffer = null;

  for (const raw of preparedLines) {
    const match = raw.match(/^\s*>\s?(.*)$/);
    if (match) {
      const value = match[1].trim();
      if (value) {
        quoteBuffer = quoteBuffer ? `${quoteBuffer} ${value}` : value;
      }
      continue;
    }
    if (quoteBuffer) {
      lines.push(quoteBuffer);
      quoteBuffer = null;
    }
    const current = raw;
    if (lines.length > 0 && shouldMergeLines(lines[lines.length - 1], current)) {
      lines[lines.length - 1] = `${lines[lines.length - 1].trim()} ${current.trim()}`;
    } else {
      lines.push(current);
    }
  }
  if (quoteBuffer) lines.push(quoteBuffer);
  const features = [];
  const sourceType = detectSourceType(filePath);
  const isFeatureDoc = isFeatureDocPath(filePath);
  const isPlanDoc = isPlanDocPath(filePath);
  let currentSection = null;
  let currentLevel = 0;
  let inFeatureSection = false;
  let skipSection = false;
  let skipSectionLevel = null;
  let currentCategory = null;
  let planContext = { active: false, status: null, phase: null, heading: null };
  let featureLead = false;
  let featureLeadLevel = null;
  let optionSection = false;
  let skipBlock = false;
  let skipBlockBlankAllowance = 0;
  let seenHeading = false;
  let headingCount = 0;
  let inCodeBlock = false;
  let codeFence = null;
  let pendingAdocBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmedLine = String(line || '').trim();

    if (inCodeBlock) {
      if (isClosingFence(trimmedLine, codeFence)) {
        inCodeBlock = false;
        codeFence = null;
      }
      continue;
    }

    if (pendingAdocBlock) {
      if (isAdocFenceLine(trimmedLine)) {
        inCodeBlock = true;
        codeFence = trimmedLine;
        pendingAdocBlock = false;
        continue;
      }
      if (trimmedLine) {
        pendingAdocBlock = false;
      }
    }

    if (isMarkdownFenceLine(trimmedLine)) {
      inCodeBlock = true;
      codeFence = trimmedLine;
      continue;
    }

    if (isAdocCodeDirective(trimmedLine)) {
      pendingAdocBlock = true;
      continue;
    }

    if (isAdocFenceLine(trimmedLine)) {
      inCodeBlock = true;
      codeFence = trimmedLine;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      seenHeading = true;
      headingCount += 1;
      const level = headingMatch[1].length;
      const titleRaw = headingMatch[2].trim();
      const title = cleanupFeatureText(titleRaw);
      const isOptionHeading = /\b(options|flags|cli options)\b/.test(normalizeText(title));
      currentSection = title;
      currentLevel = level;
      skipBlock = false;
      skipBlockBlankAllowance = 0;
      optionSection = isOptionHeading;
      if (featureLead && featureLeadLevel !== null && level <= featureLeadLevel) {
        featureLead = false;
        featureLeadLevel = null;
      }
      if (skipSection && skipSectionLevel && level > skipSectionLevel && !isOptionHeading) {
        inFeatureSection = false;
        continue;
      }
      inFeatureSection = isFeatureSection(title);
      skipSection = isNonFeatureSection(title) || isExternalProductSection(title);
      skipSectionLevel = skipSection ? level : null;
      if (isOptionHeading) {
        skipSection = false;
        skipSectionLevel = null;
      }
      currentCategory = matchCategorySection(title, filePath);
      if (isPlanDoc) {
        const planInfo = parsePlanHeading(title);
        if (planInfo.active) {
          planContext = planInfo;
        }
      }
      if (isFeatureDoc && level >= 2 && !skipSection) {
        const record = buildFeatureRecord(title, filePath, i + 1, line, options);
        if (record) {
          features.push(record);
        }
      }
      continue;
    }

    if (skipBlock) {
      if (!line.trim()) {
        if (skipBlockBlankAllowance > 0) {
          skipBlockBlankAllowance -= 1;
        } else {
          skipBlock = false;
        }
      }
      continue;
    }

    const labelMatch = line.match(/^\s*\*\*([^*]{3,60})\*\*:/);
    if (labelMatch && isNonFeatureLabel(labelMatch[1])) {
      skipBlock = true;
      skipBlockBlankAllowance = 1;
      continue;
    }

    if (!skipSection && isFeatureLeadLine(line)) {
      featureLead = true;
      featureLeadLevel = currentLevel || null;
    }

    const inFeatureContext = inFeatureSection || featureLead;
    if (inFeatureContext) {
      const listMatch = line.match(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[xX\s]\]\s*)?(.*)$/);
      if (listMatch) {
        if (isGoalListContext(lines, i)) {
          const parenthetical = extractParentheticalFeatureList(listMatch[1]);
          if (parenthetical) {
            for (const item of parenthetical) {
              const record = buildFeatureRecord(item, filePath, i + 1, line, options);
              if (record) {
                if (isPlanDoc && planContext.active) {
                  record.plan = buildPlanMeta(line, planContext);
                }
                features.push(record);
              }
            }
          }
          continue;
        }
        const optionFeature = optionSection
          ? extractOptionFeature(listMatch[1], lines, i)
          : null;
        if (optionFeature) {
          const record = buildFeatureRecord(optionFeature, filePath, i + 1, line, options);
          if (record) {
            if (isPlanDoc && planContext.active) {
              record.plan = buildPlanMeta(line, planContext);
            }
            features.push(record);
          }
          continue;
        }
        if (isLinkOnlyItem(line)) continue;
        if (isCodeOptionItem(listMatch[1])) continue;
        const labeled = extractLabeledFeature(listMatch[1]);
        if (labeled && isGenericLabel(labeled)) continue;
        let candidate = (labeled && sourceType === 'release')
          ? cleanupFeatureText(removeLeadingLabel(listMatch[1], labeled))
          : (labeled || cleanupFeatureText(listMatch[1]));
        const modeFeature = labeled ? extractModeFeatureFromLine(line) : null;
        if (modeFeature && labeled && isLowSignalText(normalizeText(labeled))) {
          candidate = modeFeature;
        }
        if (isCodePathCandidate(candidate)) continue;
        if (isExampleLine(line, candidate)) continue;
        if (isFormulaLine(line, candidate)) continue;
        if (isConfigKeyLine(candidate, line)) continue;
        if (isSupportPlanLine(candidate, line)) continue;
        if (isConditionalLead(candidate)) continue;
        if (isNegativeConstraint(candidate)) continue;
        if (isPlanDoc && isPlanNoiseLine(candidate)) continue;
        const split = splitCommaFeatures(candidate);
        if (split) {
          for (const item of split) {
            const record = buildFeatureRecord(item, filePath, i + 1, line, options);
            if (record) {
              if (isPlanDoc && planContext.active) {
                record.plan = buildPlanMeta(line, planContext);
              }
              features.push(record);
            }
          }
        } else {
          const record = buildFeatureRecord(candidate, filePath, i + 1, line, options);
          if (record) {
            if (isPlanDoc && planContext.active) {
              record.plan = buildPlanMeta(line, planContext);
            }
            features.push(record);
          }
        }
      } else if (line.trim().length === 0) {
        continue;
      } else {
        const inline = extractInlineFeature(line);
        if (inline) {
          const inlineItems = Array.isArray(inline) ? inline : [inline];
          for (const item of inlineItems) {
            const record = buildFeatureRecord(item, filePath, i + 1, line, options);
            if (record) {
              features.push(record);
            }
          }
        }
      }
    }

    if (!inFeatureSection && !skipSection) {
      if (sourceType === 'docs' || sourceType === 'doc') {
        const linkedList = extractLinkedFeatureList(line);
        if (linkedList && linkedList.length > 0) {
          for (const item of linkedList) {
            const record = buildFeatureRecord(item, filePath, i + 1, line, options);
            if (record) {
              features.push(record);
            }
          }
          continue;
        }
      }
      if (sourceType === 'release') {
        const releaseFeature = extractReleaseTableFeature(line);
        if (releaseFeature) {
          const record = buildFeatureRecord(releaseFeature, filePath, i + 1, line, options);
          if (record) {
            features.push(record);
          }
        }
      }
      if (sourceType !== 'docs' && sourceType !== 'doc') {
        const boldLabel = extractBoldLabel(line);
        if (boldLabel) {
          let candidate = boldLabel;
          const modeFeature = extractModeFeatureFromLine(line);
          if (modeFeature && isLowSignalText(normalizeText(boldLabel))) {
            candidate = modeFeature;
          }
          const record = buildFeatureRecord(candidate, filePath, i + 1, line, options);
          if (record) {
            features.push(record);
          }
        }
        const allowInline = sourceType !== 'readme' || headingCount <= 1 || i < 40;
        if (allowInline) {
          const inline = extractInlineFeature(line);
          if (inline) {
            const inlineItems = Array.isArray(inline) ? inline : [inline];
            for (const item of inlineItems) {
              const record = buildFeatureRecord(item, filePath, i + 1, line, options);
              if (record) {
                features.push(record);
              }
            }
          }
        }
      }
      const listMatch = line.match(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[xX\s]\]\s*)?(.*)$/);
      if (listMatch) {
        if (isGoalListContext(lines, i)) {
          const parenthetical = extractParentheticalFeatureList(listMatch[1]);
          if (parenthetical) {
            for (const item of parenthetical) {
              const record = buildFeatureRecord(item, filePath, i + 1, line, options);
              if (record) {
                if (isPlanDoc && planContext.active) {
                  record.plan = buildPlanMeta(line, planContext);
                }
                features.push(record);
              }
            }
          }
          continue;
        }
        const optionFeature = optionSection
          ? extractOptionFeature(listMatch[1], lines, i)
          : null;
        if (optionFeature) {
          const record = buildFeatureRecord(optionFeature, filePath, i + 1, line, options);
          if (record) {
            if (isPlanDoc && planContext.active) {
              record.plan = buildPlanMeta(line, planContext);
            }
            features.push(record);
          }
          continue;
        }
        if (isLinkOnlyItem(line)) continue;
        if (isCodeOptionItem(listMatch[1])) continue;
        const labeled = extractLabeledFeature(listMatch[1]);
        if (labeled && isGenericLabel(labeled)) continue;
        let candidate = (labeled && sourceType === 'release')
          ? cleanupFeatureText(removeLeadingLabel(listMatch[1], labeled))
          : (labeled || cleanupFeatureText(listMatch[1]));
        const modeFeature = labeled ? extractModeFeatureFromLine(line) : null;
        if (modeFeature && labeled && isLowSignalText(normalizeText(labeled))) {
          candidate = modeFeature;
        }
        if (isCodePathCandidate(candidate)) continue;
        if (isExampleLine(line, candidate)) continue;
        if (isFormulaLine(line, candidate)) continue;
        if (isConfigKeyLine(candidate, line)) continue;
        if (isSupportPlanLine(candidate, line)) continue;
        if (isConditionalLead(candidate)) continue;
        if (isNegativeConstraint(candidate)) continue;
        if (isPlanDoc && isPlanNoiseLine(candidate)) continue;
        const isChecked = /\[[xX]\]/.test(line);
        if (currentCategory) {
          if (isConfigPath(candidate) || isGenericLabel(candidate)) {
            continue;
          }
          const split = splitCommaFeatures(candidate);
          if (split) {
            for (const item of split) {
              const categoryFeature = buildCategoryFeature(currentCategory, item);
              const record = buildFeatureRecord(categoryFeature, filePath, i + 1, line, options);
              if (record) {
                if (isPlanDoc && planContext.active) {
                  record.plan = buildPlanMeta(line, planContext);
                }
                features.push(record);
              }
            }
          } else {
            const categoryFeature = buildCategoryFeature(currentCategory, candidate);
            const record = buildFeatureRecord(categoryFeature, filePath, i + 1, line, options);
            if (record) {
              if (isPlanDoc && planContext.active) {
                record.plan = buildPlanMeta(line, planContext);
              }
              features.push(record);
            }
          }
        } else {
          const labeledFeature = labeled
            ? (looksLikeFeatureItem(labeled) || looksLikeFeatureItem(candidate))
            : false;
          const planAllowed = isPlanDoc && planContext.active;
          if (labeledFeature || looksLikeFeatureItem(candidate) || (isChecked && sourceType === 'readme') || planAllowed) {
            const split = splitCommaFeatures(candidate);
            if (split) {
              for (const item of split) {
                const record = buildFeatureRecord(item, filePath, i + 1, line, options);
                if (record) {
                  if (isPlanDoc && planContext.active) {
                    record.plan = buildPlanMeta(line, planContext);
                  }
                  features.push(record);
                }
              }
            } else {
              const record = buildFeatureRecord(candidate, filePath, i + 1, line, options);
              if (record) {
                if (isPlanDoc && planContext.active) {
                  record.plan = buildPlanMeta(line, planContext);
                }
                features.push(record);
              }
            }
          }
        }
      }
      if (currentCategory && sourceType !== 'release') {
        const tableFeature = extractTableCategoryFeature(line, currentCategory);
        if (tableFeature) {
          const record = buildFeatureRecord(tableFeature, filePath, i + 1, line, options);
          if (record) {
            features.push(record);
          }
        }
      }
    }

    if (features.length >= options.maxPerFile) break;
  }

  return features;
}

function isFeatureSection(title) {
  const trimmed = String(title || '').trim();
  const normalized = normalizeText(trimmed);
  if (FEATURE_SECTION_PATTERNS.some(pattern => pattern.test(trimmed) || pattern.test(normalized))) return true;
  if (/\bfeatures?\b/i.test(trimmed) && !isNonFeatureSection(trimmed)) return true;
  if (/\bfeatures?\b/i.test(normalized) && !isNonFeatureSection(normalized)) return true;
  return false;
}

function isExternalProductSection(title) {
  const normalized = normalizeText(title);
  if (!normalized) return false;
  if (/\b(pro|enterprise|commercial|premium)\b/.test(normalized)) return true;
  if (/\bhosted\b/.test(normalized) && /\bservice\b/.test(normalized)) return true;
  return false;
}

function matchCategorySection(title, filePath) {
  const trimmed = String(title || '').trim();
  const path = String(filePath || '').replace(/\\/g, '/');
  for (const entry of CATEGORY_SECTION_PATTERNS) {
    if (!entry.regex.test(trimmed)) continue;
    if (entry.pathHint && !entry.pathHint.test(path)) continue;
    return entry.label;
  }
  return null;
}

function isNonFeatureSection(title) {
  const trimmed = String(title || '').trim();
  const normalized = normalizeText(trimmed);
  return NON_FEATURE_SECTION_PATTERNS.some(pattern => pattern.test(trimmed) || pattern.test(normalized));
}

function isNonFeatureLabel(label) {
  const normalized = normalizeText(label);
  if (!normalized) return false;
  if (['documentation', 'docs', 'discussions', 'resources', 'additional resources', 'community', 'support',
    'prerequisites', 'installation', 'install', 'options', 'keybindings'].includes(normalized)) return true;
  return isGenericLabel(normalized);
}

function extractInlineFeature(line) {
  const trimmed = String(line || '').trim();
  if (/^if\b/i.test(trimmed)) return null;
  if (/\b(?:does not|doesn't|do not|don't|will not|won't|cannot|can't)\b/i.test(trimmed)) return null;
  if (/\b(?:does not|doesn't|do not|don't|not)\s+(?:supports?|provides?|include|includes|enables?|allows?|adds?|introduces?)\b/i.test(trimmed)) {
    return null;
  }
  const verbMatch = line.match(/\b(?:supports|provides|provide|includes|enables|allows|adds|introduces)\s+(.+)/i);
  if (verbMatch) {
    let candidate = cleanupFeatureText(verbMatch[1]);
    candidate = candidate.replace(/^(?:an?|the)\s+/i, '');
    candidate = candidate.replace(/^(?:you\s+to|you\s+can|to)\s+/i, '');
    candidate = candidate.replace(/^(?:for|with)\s+/i, '');
    if (isBuildArtifactLine(candidate, line)) return null;
    if (candidate.includes(' by ')) {
      candidate = candidate.split(' by ')[0].trim();
    }
    if (candidate.length > 120) {
      candidate = candidate.split('.')[0].trim();
    }
    if (candidate.length > 120) {
      candidate = candidate.slice(0, 120).trim();
    }
    if (candidate.length < 10) return null;
    if (!looksLikeFeatureSentence(line)) return null;
    const inlineList = splitInlineFeatureList(candidate);
    if (inlineList) return inlineList;
    return candidate;
  }

  const createMatch = line.match(/\b(?:aims?|aim|is)\s+to\s+(?:create|build|provide|deliver)\s+(.+)/i);
  if (createMatch && looksLikeFeatureSentence(line)) {
    let candidate = cleanupFeatureText(createMatch[1]);
    candidate = candidate.replace(/^(?:an?|the)\s+/i, '');
    if (candidate.includes(' by ')) {
      candidate = candidate.split(' by ')[0].trim();
    }
    if (candidate.length > 120) {
      candidate = candidate.split('.')[0].trim();
    }
    if (candidate.length > 120) {
      candidate = candidate.slice(0, 120).trim();
    }
    if (candidate.length < 10) return null;
    return candidate;
  }

  if (looksLikeDescriptiveSentence(line)) {
    const descMatch = line.match(/\bis\s+(?:an?|the)\s+(.+)/i);
    if (!descMatch) return null;
    let candidate = cleanupFeatureText(descMatch[1]);
    candidate = candidate.replace(/^(?:an?|the)\s+/i, '');
    if (candidate.length > 120) {
      candidate = candidate.split('.')[0].trim();
    }
    if (candidate.length > 120) {
      candidate = candidate.slice(0, 120).trim();
    }
    if (candidate.length < 10) return null;
    if (isGenericProductDescription(candidate)) return null;
    return candidate;
  }

  return null;
}

function splitInlineFeatureList(candidate) {
  const raw = String(candidate || '').trim();
  if (!raw) return null;
  const markerMatch = raw.match(/\b(things like|such as|including)\b/i);
  if (!markerMatch || typeof markerMatch.index !== 'number') return null;
  let tail = raw.slice(markerMatch.index + markerMatch[0].length).trim();
  if (!tail) return null;
  tail = tail.replace(/^[:\-\s]+/, '');
  tail = tail.replace(/\b(and a few others|and others|and more|and so on)\b/i, '').trim();
  tail = tail.replace(/\betc\.?$/i, '').trim();
  if (!tail || tail.length < 4) return null;
  const parts = tail.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const cleaned = parts
    .map(part => part.replace(/^(and|or)\s+/i, '').trim())
    .filter(part => part && part.length >= 3);
  if (cleaned.length < 2) return null;
  return cleaned;
}

function extractOptionFeature(rawText, lines, index) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  const flagMatch = text.match(/--[a-z0-9][\w-]*/i);
  if (!flagMatch) return null;
  const flag = flagMatch[0].replace(/^--/, '').toLowerCase();
  if (!flag || flag === 'help' || flag === 'version') return null;
  let label = flag.replace(/-/g, ' ').trim();
  if (!label) return null;
  if (label === 'silent') label = 'silent mode';
  if (label === 'quiet') label = 'quiet mode';
  if (label === 'verbose') label = 'verbose output';
  if (label === 'revert') {
    const desc = findNextNonEmptyLine(lines, index + 1);
    if (desc && desc.includes('revert') && desc.includes('clean')) {
      label = 'revert cleanup';
    }
  }
  return label;
}

function findNextNonEmptyLine(lines, startIndex) {
  for (let i = startIndex; i < Math.min(lines.length, startIndex + 4); i += 1) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) return null;
    if (/^#{1,6}\s+/.test(line)) return null;
    return line.toLowerCase();
  }
  return null;
}

function extractModeFeatureFromLine(line) {
  const raw = String(line || '');
  if (!raw.includes(':')) return null;
  const match = raw.match(/\b([A-Za-z][A-Za-z\s-]{2,30})\s+mode\b/i);
  if (!match) return null;
  return cleanupFeatureText(match[0]);
}

function extractLinkedFeatureList(line) {
  const raw = String(line || '');
  if (!raw) return null;
  const match = raw.match(/features?\s+includes?/i);
  if (!match || typeof match.index !== 'number') return null;
  const start = match.index;
  if (start < 0) return null;
  const tail = raw.slice(start);
  const items = [];
  const linkRegex = /\[([^\]]{3,80})\]\([^)]+\)/g;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(tail)) !== null) {
    const cleaned = cleanupFeatureText(linkMatch[1]);
    if (cleaned) items.push(cleaned);
  }
  if (items.length >= 2) return items;
  return null;
}

function shouldMergeLines(previous, current) {
  const prev = String(previous || '').trim();
  const curr = String(current || '').trim();
  if (!prev || !curr) return false;
  if (isMarkdownFenceLine(prev) || isMarkdownFenceLine(curr)) return false;
  if (isAdocFenceLine(prev) || isAdocFenceLine(curr)) return false;
  if (isAdocCodeDirective(prev) || isAdocCodeDirective(curr)) return false;
  if (/^#{1,6}\s+/.test(curr)) return false;
  if (/^\s*(?:[-*+]|\d+\.)\s+/.test(curr)) return false;
  if (/^```/.test(curr) || /^```/.test(prev)) return false;
  if (/^\|/.test(curr)) return false;
  if (/^\s*</.test(curr)) return false;
  if (/[.!?:]$/.test(prev)) return false;
  return true;
}

function looksLikeFeatureSentence(line) {
  const normalized = normalizeText(line);
  if (!normalized) return false;
  return /\b(build|create|develop|render|deploy|generate|optimize|accelerate|improve|add|adds|introduce|introduces|support|supports|provide|provides|include|includes|enable|enables|allow|allows)\b/.test(normalized);
}

function isBuildArtifactLine(candidate, line) {
  const normalized = normalizeText(candidate);
  const full = normalizeText(line);
  if (!normalized) return false;
  if (/(jquery\.js|module\.js|sourcemap|minified)/i.test(line)) return true;
  if (normalized.startsWith('in a release')) return true;
  if (normalized.startsWith('only the modules you need')) return true;
  if (normalized.startsWith('are dropped and a build is created')) return true;
  if (full.includes('build') && full.includes('include') && full.includes('modules')) return true;
  return false;
}

function looksLikeDescriptiveSentence(line) {
  const normalized = normalizeText(line);
  if (!normalized) return false;
  const matches = DESCRIPTIVE_HINTS.filter(hint => normalized.includes(hint));
  if (matches.length === 0) return false;
  const genericOnly = matches.every(hint => ['framework', 'library', 'tool', 'cli'].includes(hint));
  return !genericOnly;
}

function cleanupFeatureText(text) {
  let cleaned = String(text || '')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/`/g, '')
    .replace(/\{\s*#[^}]+\}/g, '')
    .replace(/[*_]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[|]+$/g, '')
    .replace(/[:.;,]+$/g, '')
    .trim();

  cleaned = cleaned.replace(/^[^A-Za-z0-9]+/g, '').replace(/[^A-Za-z0-9]+$/g, '').trim();

  if (cleaned.includes(' - ')) {
    cleaned = cleaned.split(' - ')[0].trim();
  }
  if (cleaned.includes(' – ')) {
    cleaned = cleaned.split(' – ')[0].trim();
  }
  if (cleaned.includes(' — ')) {
    cleaned = cleaned.split(' — ')[0].trim();
  }
  if (cleaned.includes(' e.g.')) {
    cleaned = cleaned.split(' e.g.')[0].trim();
  }
  if (cleaned.includes(' e.g ')) {
    cleaned = cleaned.split(' e.g ')[0].trim();
  }
  if (cleaned.includes(' i.e.')) {
    cleaned = cleaned.split(' i.e.')[0].trim();
  }
  if (cleaned.includes(' i.e ')) {
    cleaned = cleaned.split(' i.e ')[0].trim();
  }
  cleaned = cleaned.replace(/\([a-f0-9]{7,}\)/gi, '').trim();
  cleaned = cleaned.replace(/\(#\d+[^)]*\)/g, '').trim();
  cleaned = cleaned.replace(/\b(e\.g\.?|i\.e\.?)$/i, '').trim();
  cleaned = cleaned.replace(/[:.;,]+$/g, '').trim();

  if (cleaned.includes('(') && !cleaned.includes(')')) {
    cleaned = cleaned.split('(')[0].trim();
  }

  return cleaned;
}

function isGenericProductDescription(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const words = normalized.split(' ').filter(Boolean);
  if (words.length === 0) return false;
  const tail = words[words.length - 1];
  const genericTails = new Set(['library', 'framework', 'tool', 'cli', 'sdk', 'platform', 'service', 'application']);
  if (!genericTails.has(tail)) return false;
  if (words.length <= 5) return true;
  return words.some(word => ['simple', 'elegant', 'fast', 'lightweight', 'modern'].includes(word));
}

function isMarkdownFenceLine(line) {
  const trimmed = String(line || '').trim();
  return trimmed.startsWith('```') || trimmed.startsWith('~~~');
}

function isAdocFenceLine(line) {
  const trimmed = String(line || '').trim();
  return trimmed === '----' || trimmed === '....' || trimmed === '++++';
}

function isAdocCodeDirective(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return false;
  return /\b(source|listing|literal|code|example)\b/i.test(trimmed);
}

function isClosingFence(trimmedLine, fence) {
  if (!trimmedLine) return false;
  if (!fence) return false;
  if (fence.startsWith('```') || fence.startsWith('~~~')) {
    return trimmedLine.startsWith(fence.slice(0, 3));
  }
  return trimmedLine === fence;
}

function extractLabeledFeature(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const boldWithColonMatch = raw.match(/^\*\*([^*]{3,40}):\*\*\s*/);
  if (boldWithColonMatch) return boldWithColonMatch[1].trim();

  const boldMatch = raw.match(/^\*\*([^*]{3,40})\*\*:\s*/);
  if (boldMatch) return boldMatch[1].trim();

  const colonMatch = raw.match(/^([^:]{3,40}):\s+/);
  if (colonMatch) {
    const label = colonMatch[1].trim();
    if (label.includes('<') || label.includes('>')) return null;
    if (label.includes('`')) return null;
    return label;
  }

  return null;
}

function isLinkOnlyItem(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return false;
  return /^\s*(?:[-*+]|\d+\.)\s*(?:\[[xX\s]\]\s*)?\[[^\]]+\]\([^)]+\)\s*$/.test(trimmed);
}

function isCodeOptionItem(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('`')) return false;
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx !== -1 && colonIdx < 40) return true;
  if (/^`[^`]+`$/.test(trimmed)) return true;
  return false;
}

function isNegativeConstraint(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return /\bnot supported\b/.test(normalized)
    || /\bonly accepts\b/.test(normalized)
    || /\b(will not|won't|does not|doesn't|do not|don't|cannot|can't)\b/.test(normalized);
}

function isSupportPlanLine(candidate, line) {
  const normalized = normalizeText(candidate);
  if (!normalized) return false;
  if (normalized.includes('best for')) return true;
  if (/\bbest for\b/i.test(line)) return true;
  if (normalized.includes('support') && /\bsla\b/i.test(line)) return true;
  return false;
}

function isExampleLine(line, candidate) {
  const normalized = normalizeText(candidate);
  if (!normalized) return false;
  if (/ctrl\+|command\+/i.test(line)) return true;
  if (normalized.startsWith('a ') && /[()]/.test(candidate)) return true;
  if (/\bexample\b/i.test(candidate)) return true;
  if (/\bfor example\b/i.test(line)) return true;
  return false;
}

function isFormulaLine(line, candidate) {
  const raw = String(line || '');
  const text = String(candidate || '');
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (normalized.includes('equivalent to') || normalized.includes('is equivalent')) return true;
  const cleanedRaw = raw
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '');
  const hasDigits = /\d/.test(cleanedRaw);
  const letterCount = (cleanedRaw.match(/[A-Za-z]/g) || []).length;
  const opCount = (cleanedRaw.match(/[+\-/*%^]/g) || []).length;
  const mathCount = (cleanedRaw.match(/[0-9+\-/*%^=]/g) || []).length;
  if (letterCount > 12 && mathCount < 4) return false;
  if (letterCount > mathCount * 2) return false;
  const hasOps = opCount > 0;
  const hasParen = /[()]/.test(cleanedRaw);
  if (hasDigits && hasOps && hasParen) return true;
  if (hasDigits && opCount >= 2) return true;
  if (/\b(step\(\)|sum\(|rate\(|min\(|max\(|avg\(|count\(|quantile\(|sumovertime\()\b/i.test(cleanedRaw)) return true;
  if (/\/\s*:\s*/.test(cleanedRaw)) return true;
  return false;
}

function isConfigKeyLine(candidate, line) {
  const trimmed = String(candidate || '').trim();
  if (!trimmed) return false;
  const full = String(line || '');
  const cleanedLine = full.replace(/\[[^\]]+\]\([^)]+\)/g, '');
  const firstToken = trimmed.split(/\s+/)[0] || trimmed;
  if (/^--/.test(firstToken)) return true;
  if (!/^[a-z0-9_.-]+$/i.test(firstToken)) return false;
  if (firstToken.length < 4 || firstToken.length > 40) return false;
  if (cleanedLine.includes('#') || cleanedLine.includes('=')) return true;
  const tokenLower = firstToken.toLowerCase();
  if (['enable', 'disable', 'flag', 'option', 'setting'].includes(tokenLower) && firstToken.length <= 30) return true;
  return false;
}

function isConditionalLead(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return normalized.startsWith('if ') || normalized.startsWith('when ');
}

function removeLeadingLabel(text, label) {
  const escaped = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text || '').replace(new RegExp(`^\\s*${escaped}\\s*:\\s*`, 'i'), '');
}

function buildCategoryFeature(category, candidate) {
  const cleaned = cleanupFeatureText(candidate);
  if (!cleaned) return null;
  return `${category}: ${cleaned}`;
}

function extractTableCategoryFeature(line, category) {
  const trimmed = String(line || '').trim();
  if (!trimmed.startsWith('|')) return null;
  if (/^\|\s*:?[-]+/.test(trimmed)) return null;
  const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
  if (cells.length === 0) return null;
  const first = cleanupFeatureText(cells[0]);
  if (!first || first.length > 80) return null;
  if (/`/.test(first)) return null;
  if (isGenericLabel(first)) return null;
  if (isConfigPath(first)) return null;
  return `${category}: ${first}`;
}

function extractReleaseTableFeature(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed.startsWith('|')) return null;
  if (/^\|\s*:?[-]+/.test(trimmed)) return null;
  const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
  if (cells.length < 3) return null;
  const header = cells.map(c => c.toLowerCase());
  if (header[0] === 'commit' || header[1] === 'type' || header[2] === 'description') return null;
  if (!/^feat/i.test(cells[1])) return null;
  const description = cleanupFeatureText(cells[2]);
  if (!description) return null;
  return description;
}

function extractBoldLabel(line) {
  const trimmed = String(line || '').trim();
  const linkCount = (trimmed.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
  if (linkCount === 1 && (trimmed.startsWith('.') || trimmed.endsWith('.'))) {
    return null;
  }
  if (linkCount >= 2) return null;
  if (/^(\*\*\[[^\]]+\]\([^)]+\)\*\*|\*\*[^*]+\*\*)$/.test(trimmed)) {
    return null;
  }
  const linkMatch = trimmed.match(/^\*\*\[([^\]]{3,40})\]\([^)]+\)\*\*/);
  if (linkMatch) {
    return linkMatch[1].trim();
  }
  const match = trimmed.match(/^\*\*([^*]{3,40})\*\*/);
  if (!match) return null;
  let label = match[1].trim();
  if (label.endsWith('.')) label = label.slice(0, -1).trim();
  if (label.endsWith(':')) label = label.slice(0, -1).trim();
  return label || null;
}

function isConfigPath(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  if (/\s/.test(trimmed)) return false;
  return /^[a-z0-9_]+(\.[a-z0-9_\[\]]+)+$/i.test(trimmed);
}

function isGenericLabel(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  return GENERIC_LABELS.has(normalized);
}

function buildFeatureRecord(name, filePath, lineNumber, contextLine, options) {
  if (!name) return null;
  let trimmedName = name;
  if (trimmedName.length > options.maxLength) {
    trimmedName = trimFeatureName(trimmedName, options.maxLength);
  }
  if (trimmedName.startsWith('@')) return null;
  if (trimmedName.length < options.minLength || trimmedName.length > options.maxLength) return null;
  if (isGenericLabel(trimmedName)) return null;
  if (isEnvVarListing(trimmedName, contextLine)) return null;

  const sourceType = detectSourceType(filePath);
  if (sourceType === 'release' && (isReleaseHeading(trimmedName) || isReleaseNoise(trimmedName))) return null;

  const normalized = normalizeText(trimmedName);
  if (normalized.endsWith(' with')) return null;
  if (normalized.startsWith('plugin ') && normalized.split(' ').length <= 2) return null;
  if (normalized.startsWith('plugin ') && /(enable|remove|disable)/.test(normalized)) return null;
  if (sourceType === 'plan' && (isInstructionalText(normalized) || isPlanInstruction(normalized))) return null;
  if (sourceType === 'plan' && /^(manual test|test flow)/.test(normalized)) return null;
  if ((sourceType === 'docs' || sourceType === 'doc') && isInstructionalText(normalized)) {
    const allowDocShould = /^\s*(?:[-*+]|\d+\.)\s+/.test(contextLine || '')
      && /\bshould\s+(work|run|support)\b/.test(normalized);
    if (!allowDocShould && !/\bfeatures?\s+include/i.test(contextLine || '')) return null;
  }
  if (sourceType === 'readme' && isInstructionalText(normalized) && looksLikeInstructionContext(contextLine)) return null;
  const tokens = tokenize(normalized);
  if (tokens.length === 1 && contextLine) {
    const contextNormalized = normalizeText(contextLine);
    if (contextNormalized.startsWith(`${normalized} is `) &&
      /\b(library|framework|tool|cli|sdk|platform|application)\b/.test(contextNormalized)) {
      return null;
    }
  }
  if (sourceType !== 'release' && tokens.length < 2) {
    const allowSingleInContext = contextLine && /\bfeatures?\b/i.test(contextLine);
    const allowInlineList = contextLine && /\b(things like|such as|including)\b/i.test(contextLine);
    if (!allowSingleInContext && !allowInlineList && !isAllowedSingleToken(trimmedName) && !isFeatureDocPath(filePath)) {
      return null;
    }
  }
  if (sourceType !== 'release' && isLowSignalText(normalized)) return null;
  if (tokens.length === 0) return null;

  return {
    name: trimmedName,
    normalized,
    tokens,
    sourceFile: filePath,
    sourceType: sourceType,
    sourceLine: lineNumber,
    context: contextLine.trim().slice(0, 200)
  };
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return String(text || '')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => {
      if (!token || STOPWORDS.has(token)) return false;
      if (token.length >= 3) return true;
      return token.length === 2 && SHORT_TOKENS.has(token);
    });
}

function looksLikeFeatureItem(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (normalized.length < 10) return false;
  if (/^https?:\/\//.test(normalized)) return false;

  if (text.includes(':')) {
    const leading = text.split(':')[0].trim();
    if (leading.length > 2 && leading.length <= 40 && /^[A-Z][A-Za-z0-9 /-]+$/.test(leading)) {
      return true;
    }
  }

  for (const keyword of FEATURE_BULLET_KEYWORDS) {
    if (/^[a-z]+$/.test(keyword)) {
      const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
      if (pattern.test(normalized)) return true;
    } else if (normalized.includes(keyword)) {
      return true;
    }
  }

  const verbMatch = normalized.match(/^(built|build|support|include|provide|enable|allow|offer|ship|deliver|optimize|bundle|bundles|can|create|creates|transform|preprocess|package|extract|compile|loaders?|dependencies?|dependency|iterating|manipulating|creating|testing)\b/);
  return Boolean(verbMatch);
}

function dedupeFeatures(features) {
  const seen = new Set();
  const output = [];

  for (const feature of features) {
    if (!feature || !feature.normalized) continue;
    if (seen.has(feature.normalized)) continue;
    seen.add(feature.normalized);
    output.push(feature);
  }

  return output;
}

function trimFeatureName(text, maxLength) {
  let value = String(text || '').trim();
  if (!value) return value;
  const splitters = ['. ', '; ', ' — ', ' - ', ', '];
  for (const splitter of splitters) {
    const idx = value.indexOf(splitter);
    if (idx > 0 && idx <= maxLength) {
      return value.slice(0, idx).trim();
    }
  }
  if (value.length > maxLength) {
    value = value.slice(0, maxLength).trim();
  }
  value = value.replace(/\b(e\.g\.?|i\.e\.?)$/i, '').trim();
  return value;
}

function detectSourceType(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  const base = normalized.split('/').pop() || '';
  if (normalized.includes('/plans/') || base.includes('plan') || normalized.includes('/roadmap/')) return 'plan';
  if (/(^|\/)docs\//.test(normalized)) return 'docs';
  if (/(^|\/)examples?\//.test(normalized)) return 'example';
  if (base.startsWith('readme.')) {
    if (normalized === 'readme.md' || normalized === 'readme.rst' || normalized === 'readme.mdx') return 'readme';
    if (normalized === '.github/readme.md' || normalized === '.github/readme.rst' || normalized === '.github/readme.mdx') return 'readme';
    return 'doc';
  }
  if (base.includes('changelog') || base.includes('release') || base.includes('history')) return 'release';
  if (normalized.includes('/checklists/')) return 'checklist';
  return 'doc';
}

function deriveFeaturesFromPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  const output = [];
  const ignoreNames = new Set(['index', 'common', 'common-ticks', 'common_ticks']);
  const chartMatch = normalized.match(/^docs\/charts\/([^/]+)\.md$/);
  if (chartMatch) {
    const name = chartMatch[1];
    if (!ignoreNames.has(name) && !name.startsWith('_') && name !== 'README') {
      output.push(`Chart type: ${formatFeatureName(name)}`);
    }
  }
  const pluginMatch = normalized.match(/^docs\/plugins\/([^/]+)\.md$/);
  if (pluginMatch) {
    const name = pluginMatch[1];
    if (!ignoreNames.has(name) && !name.startsWith('_')) {
      output.push(`Plugin: ${formatFeatureName(name)}`);
    }
  }
  const elementMatch = normalized.match(/^docs\/elements\/([^/]+)\.md$/);
  if (elementMatch) {
    const name = elementMatch[1];
    if (!ignoreNames.has(name) && !name.startsWith('_')) {
      output.push(`Element: ${formatFeatureName(name)}`);
    }
  }
  const axisMatch = normalized.match(/^docs\/axes\/([^/]+)\/([^/]+)\.md$/);
  if (axisMatch) {
    const name = axisMatch[2];
    if (!ignoreNames.has(name) && !name.startsWith('_')) {
      output.push(`Scale: ${formatFeatureName(name)}`);
    }
  }
  const extensionMatch = normalized.match(/^extensions\/([^/]+)\/readme\.md$/);
  if (extensionMatch) {
    const name = extensionMatch[1];
    if (!ignoreNames.has(name) && !name.startsWith('_')) {
      output.push(`Extension: ${formatFeatureName(name)}`);
    }
  }
  return output;
}

function formatFeatureName(name) {
  return String(name || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function isReleaseHeading(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (normalized.length <= 4) return true;
  if (!normalized.includes(' ') && normalized.length <= 10) {
    return ['tests', 'windows', 'selector', 'build', 'docs'].includes(normalized);
  }
  return false;
}

function isReleaseNoise(text) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (/^(fix|refactor|tests?|docs?|chore|build|ci)\b/.test(normalized)) return true;
  if (normalized.includes('test') && normalized.length < 40) return true;
  if (text && text.includes('::')) return true;
  if (text && /[`#]/.test(text)) return true;
  if (text && /[{}\[\]]/.test(text)) return true;
  if (text && /\b\w+::\w+/.test(text)) return true;
  if (normalized.includes('http') || normalized.includes('https')) return true;
  if (/\b(std|core|alloc|crate)\b::/.test(text || '')) return true;
  if (/^(allow|enable)\b/.test(normalized) && /(attribute|intrinsic|abi|unsafe|target feature)/.test(normalized)) return true;
  if (text) {
    const signalHits = [
      /`/.test(text),
      /#/.test(text),
      /\.\./.test(text),
      /[{}\[\]]/.test(text),
      /[()]/.test(text)
    ].filter(Boolean).length;
    if (signalHits >= 2) return true;
  }
  return false;
}

function stripLinks(raw) {
  return String(raw || '')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLowSignalText(normalized, raw) {
  if (!normalized) return true;
  if (LOW_SIGNAL_EXACT.has(normalized)) return true;
  for (const prefix of LOW_SIGNAL_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  if (normalized.startsWith('optional ') && normalized.split(' ').length <= 3) return true;
  if (normalized.endsWith(' endpoint') && normalized.split(' ').length <= 3) return true;
  if (normalized.endsWith(' endpoints') && normalized.split(' ').length <= 3) return true;
  if (raw && /https?:\/\//i.test(raw)) {
    const stripped = stripLinks(raw);
    const strippedNormalized = normalizeText(stripped);
    const wordCount = strippedNormalized.split(' ').filter(Boolean).length;
    if (wordCount <= 3 || strippedNormalized.length < 12) return true;
  }
  for (const fragment of LOW_SIGNAL_CONTAINS) {
    if (normalized.includes(fragment)) return true;
  }
  for (const regex of LOW_SIGNAL_REGEX) {
    if (regex.test(normalized)) return true;
  }
  if (normalized.endsWith('features') && normalized.split(' ').length <= 4) return true;
  if (normalized.endsWith('such as') || normalized.endsWith('including')) return true;
  if (normalized.startsWith('vite ') && /\d/.test(normalized)) return true;
  if (normalized.includes('version') && /\d/.test(normalized)) return true;
  if (normalized.includes('build matrix')) return true;
  if (normalized.startsWith('--') || normalized.startsWith('-')) return true;
  if (/^(get|post|put|delete|patch|options|head)$/.test(normalized)) return true;
  if (normalized.includes('donat') || normalized.includes('donation') || normalized.includes('donating')) return true;
  if (normalized.includes('cup of coffee') || normalized.includes('buy me a coffee')) return true;
  if (normalized.includes('refer to') || normalized.startsWith('see ') || normalized.startsWith('see:')) return true;
  if (normalized.endsWith('-')) return true;
  if (/^(you|your|we|our)\b/.test(normalized)) {
    const wordCount = normalized.split(' ').length;
    if (wordCount <= 4) return true;
  }
  return false;
}

function isInstructionalText(normalized) {
  if (!normalized) return false;
  const cleaned = normalized.replace(/^(optional|optionally|or|then)\s+/, '');
  if (/^learn\b/.test(cleaned)) {
    return /\blearn\s+(how to|to|more|about)\b/.test(cleaned);
  }
  if (/^read\b/.test(cleaned)) {
    return /\bread\s+(the|more|about|docs|documentation)\b/.test(cleaned);
  }
  return /^(create|add|copy|update|remove|delete|install|configure|setup|set up|run|download|clone|check|verify|use|open|start|stop|build|compile|generate|train|fine tune|fine-tune|evaluate|export|edit|write|grab|join|get|visit|see|follow|try|ensure|should|must|need to|you should)\b/.test(cleaned);
}

function isPlanInstruction(normalized) {
  if (!normalized) return false;
  return /^(format|scroll|press|mark|save|verify|run|delete|export|copy|open|jump|switch|toggle|select|focus)\b/.test(normalized);
}

function looksLikeInstructionContext(contextLine) {
  const line = String(contextLine || '').toLowerCase();
  if (!line) return false;
  if (/^\s*\d+\.\s+/.test(line)) return true;
  if (/^\s*[-*+]\s+/.test(line)) {
    if (/\blearn\b/.test(line) && /\blearn\s+(how to|to|more|about)\b/.test(line)) return true;
    if (/(install|build|run|download|configure|setup|enable|get|grab|join|visit|read|see|follow|try)\b/.test(line)) return true;
  }
  if (/(pip install|brew install|apt install|yum install|docker run|docker build)/.test(line)) return true;
  return false;
}

function isGoalListContext(lines, index) {
  for (let back = 1; back <= 4; back += 1) {
    const prior = lines[index - back];
    if (!prior) continue;
    const trimmedPrior = String(prior || '').trim();
    if (/^[-*+]\s+/.test(trimmedPrior)) continue;
    const normalized = normalizeText(prior);
    if (!normalized) continue;
    if (/(goal|goals|goal list|principle|principles|philosophy|values|tenets|manifesto)/.test(normalized)) return true;
    if (normalized.endsWith('should be') || normalized.endsWith('should be:')) return true;
    if (normalized.includes('we follow these principles')) return true;
    if (normalized.includes('we strive to fulfill the goals')) return true;
  }
  return false;
}

function isAllowedSingleToken(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  const upper = trimmed.toUpperCase();
  if (ALLOWED_SINGLE_TOKENS.has(upper)) return true;
  if (trimmed.includes('-')) {
    if (/^[A-Z0-9_-]+$/.test(trimmed)) return false;
    return true;
  }
  if (/^[A-Z0-9_]+$/.test(trimmed)) return false;
  return /^[A-Z][A-Za-z0-9]{4,}$/.test(trimmed);
}

function isEnvVarListing(text, contextLine) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  const tokens = raw.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || [];
  if (tokens.length === 0) return false;
  const longTokens = tokens.filter(token => token.includes('_') || /\d/.test(token) || token.length >= 10);
  if (longTokens.length === 0) return false;
  if (tokens.length >= 2) return true;
  const token = tokens[0];
  if (raw === token) return true;
  if (raw.startsWith(token)) {
    const rest = raw.slice(token.length).trim();
    if (/^(?:-|–|—|:)/.test(rest)) return true;
    if (/(defaults?|default|env|environment|config|for\b|set\b|value\b)/i.test(rest)) return true;
  }
  if (contextLine && /(env var|environment variable|configuration|config)/i.test(contextLine)) return true;
  return false;
}

function isFeatureDocPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  if (/(^|\/)features?\.md$/i.test(normalized)) return true;
  if (/\/docs\/(concepts|guide|tutorial|tutorials|changes)\//.test(normalized)) return true;
  return false;
}

function isPlanDocPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/plans/') || normalized.includes('/roadmap/')) return true;
  return /(^|\/)(plan|roadmap|milestones?|phases?)(\.md)?$/i.test(normalized);
}

function isFeatureLeadLine(line) {
  const normalized = normalizeText(line);
  if (!normalized) return false;
  if (normalized.endsWith('features')) return true;
  if (normalized.endsWith('features:')) return true;
  if (normalized.includes('with the following features')) return true;
  if (normalized.includes('features include') || normalized.includes('features including')) return true;
  if (normalized.includes('main features')) return true;
  if (normalized.includes('features of')) return true;
  if (normalized.includes('features are')) return true;
  return false;
}

function isCodePathCandidate(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const cleaned = value.replace(/`/g, '');
  if (cleaned.includes('/') || cleaned.includes('\\')) {
    if (/\.[a-z0-9]{1,5}$/i.test(cleaned)) return true;
  }
  if (/^[\w./-]+\.[a-z0-9]{1,5}$/i.test(cleaned)) return true;
  return false;
}

function splitCommaFeatures(text) {
  const value = String(text || '').trim();
  if (!value || !value.includes(',')) return null;
  if (/[.:;]/.test(value)) return null;
  if (/\b(including|includes|provides|supports|ensures|allows|designed|based)\b/i.test(value)) return null;
  if (/\bfor\b/i.test(value)) return null;
  if (value.length > 140) return null;
  const parts = value.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  for (const part of parts) {
    if (part.length < 3 || part.length > 80) return null;
    if (/\b(and|or)\b/i.test(part) && parts.length <= 3) return null;
  }
  return parts;
}

function extractParentheticalFeatureList(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (!/(for example|for instance|e\.g\.|such as)/.test(lower)) return null;
  const match = value.match(/\(([^)]+)\)/);
  if (!match) return null;
  let inside = cleanupFeatureText(match[1]);
  inside = inside.replace(/^(for example|for instance|e\.g\.)\s*,?\s*/i, '');
  if (!inside || inside.length < 6) return null;
  return splitCommaFeatures(inside);
}

function parsePlanHeading(title) {
  const normalized = normalizeText(title);
  if (!normalized) return { active: false, status: null, phase: null, heading: null };
  const lower = normalized.toLowerCase();
  const phaseMatch = lower.match(/\bphase\s+([0-9ivx]+)\b/);
  const milestoneMatch = lower.match(/\bmilestone\s+([a-z0-9._-]+)\b/);
  let phase = null;
  if (phaseMatch) {
    phase = `Phase ${phaseMatch[1].toUpperCase()}`;
  } else if (milestoneMatch) {
    phase = `Milestone ${milestoneMatch[1]}`;
  }

  let status = null;
  if (/(done|completed|shipped|released)/.test(lower)) status = 'done';
  else if (/(in progress|current|now|active|working on)/.test(lower)) status = 'in_progress';
  else if (/(planned|upcoming|next|later|future|backlog|todo|to do)/.test(lower)) status = 'planned';

  const active = Boolean(phase || status || /(plan|roadmap|milestone|phase)/.test(lower));
  return { active, status, phase, heading: title };
}

function buildPlanMeta(line, context) {
  const status = resolvePlanStatus(line, context?.status);
  return {
    status,
    phase: context?.phase || null,
    section: context?.heading || null
  };
}

function resolvePlanStatus(line, fallback) {
  if (/\[[xX]\]/.test(line)) return 'done';
  if (/\[\s?\]/.test(line)) return fallback || 'planned';
  return fallback || null;
}

function isPlanNoiseLine(text) {
  const normalized = normalizeText(text);
  if (!normalized) return true;
  if (PLAN_NOISE_EXACT.has(normalized)) return true;
  for (const prefix of PLAN_NOISE_PREFIXES) {
    if (normalized.startsWith(prefix)) return true;
  }
  if (/^task\s+\d+\b/.test(normalized)) return true;
  if (normalized.startsWith('focus on ')) return true;
  if (normalized.startsWith('final ')) return true;
  if (/^(improve|update)\b/.test(normalized) &&
    /(documentation|formatting|organization|guide|dashboard|investigation)/.test(normalized)) {
    return true;
  }
  if (/^(update|updates|document|documents|apply|applies|ensure|ensures|review|reviews|verify|verifies|configure|configures|include|includes|reflect|reflects|keep|keeps)\b/.test(normalized) &&
    !/\b(feature|support|plugin|api|client|engine|driver|connector|integration|schema|migration)\b/.test(normalized)) {
    return true;
  }
  if (/^(all|some|no|these|this|that)\b/.test(normalized) &&
    /\b(should|can|must|need|needs|required|required to|be)\b/.test(normalized)) {
    return true;
  }
  if (normalized.includes('agents md') || normalized.includes('documentation') || normalized.includes('documented') || normalized.includes('docs')) {
    return true;
  }
  if (/^(no|some|all)\b/.test(normalized) &&
    /(documented|benchmark|examples?|files?|paths?|dependencies|suppression)/.test(normalized)) {
    return true;
  }
  if (/\b(guide|dashboard|investigation|results)\b/.test(normalized)) return true;
  if (/\b(correct|accurate|format|formats|import statements|file paths)\b/.test(normalized)) return true;
  return false;
}

module.exports = {
  extractFeaturesFromDocs,
  normalizeText,
  tokenize
};
