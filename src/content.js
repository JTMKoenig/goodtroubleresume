const PERCENT_RE = /\b\d{1,3}\s*%/;
const FIBER_RE = /(cotton|linen|wool|silk|polyester|nylon|spandex|elastane|viscose|rayon|acrylic|lyocell|tencel|modal|cashmere|hemp|leather|suede|down|alpaca|mohair)/i;
const EXCLUDE_RE = /(save|discount|subscribe|sign up|coupon|reward|sale|% off)/i;
const MATERIAL_FIELD_RE = /^(material|materials|fabric|composition)$/i;
const MATERIAL_NAME_RE = /(material|materials|fabric|composition)/i;
const MAX_MATERIAL_ENTRIES = 4;
const DEBUG_MATERIALS = true;
const FIBER_MATCH_RE = new RegExp(FIBER_RE.source, "gi");
const MATERIAL_PHRASE_RE = new RegExp(`\\b\\d{1,3}\\s*%\\s*(?:[a-z]+(?:\\s+[a-z]+){0,2}\\s+)?${FIBER_RE.source}\\b`, "gi");

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
}

function isMaterialCandidate(text) {
  return Boolean(text) && PERCENT_RE.test(text) && FIBER_RE.test(text) && !EXCLUDE_RE.test(text);
}


function extractMaterialPhrases(text) {
  const normalized = normalizeText(text || "");
  if (!normalized) {
    return [];
  }

  const phrases = [];
  const seen = new Set();
  const matches = normalized.match(MATERIAL_PHRASE_RE) || [];

  for (const match of matches) {
    const phrase = normalizeText(match);
    const key = phrase.toLowerCase();

    if (!phrase || seen.has(key)) {
      continue;
    }

    seen.add(key);
    phrases.push(phrase);

    if (phrases.length >= MAX_MATERIAL_ENTRIES) {
      break;
    }
  }

  return phrases;
}

function isCleanLabeledCompositionLine(text) {
  if (!text || text.length > 180 || !text.includes(":")) {
    return false;
  }

  const hasPercentFiber = PERCENT_RE.test(text) && FIBER_RE.test(text);
  return hasPercentFiber && !EXCLUDE_RE.test(text);
}

function addMaterialHitsFromText(hits, text) {
  if (!text || EXCLUDE_RE.test(text)) {
    return;
  }

  if (isCleanLabeledCompositionLine(text)) {
    hits.add(text);
    return;
  }

  const phrases = extractMaterialPhrases(text);
  for (const phrase of phrases) {
    hits.add(phrase);
    if (hits.size >= MAX_MATERIAL_ENTRIES) {
      break;
    }
  }
}

function toMaterialEntries(value) {
  if (typeof value === "string") {
    return value.split(/\n+|•|·|\|/).map((entry) => normalizeText(entry)).filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => toMaterialEntries(entry));
  }

  return [];
}

function addMaterialEntry(set, value) {
  const entries = toMaterialEntries(value);
  for (const entry of entries) {
    if (entry.length > 220) {
      continue;
    }

    set.add(entry);
    if (set.size >= MAX_MATERIAL_ENTRIES) {
      break;
    }
  }
}

function postProcessMaterials(rawMaterials, contextLabel = "") {
  if (!rawMaterials || !String(rawMaterials).trim()) {
    return null;
  }

  const entries = toMaterialEntries(rawMaterials);
  if (entries.length === 0) {
    return null;
  }

  const deduped = [];
  const seen = new Set();

  for (const entry of entries) {
    const display = normalizeText(entry);
    const key = display.toLowerCase();
    if (!display || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push({ key, display });
  }

  const subsetFiltered = deduped.filter((a, idxA) => {
    const aTokens = a.key.split(/\s+/).filter(Boolean);

    for (let idxB = 0; idxB < deduped.length; idxB += 1) {
      if (idxA === idxB) {
        continue;
      }

      const b = deduped[idxB];
      const containsDirect = b.key.includes(a.key);
      const containsAllTokens = aTokens.length > 0 && aTokens.every((token) => b.key.includes(token));

      if ((containsDirect || containsAllTokens) && b.key.length >= a.key.length + 6) {
        return false;
      }
    }

    return true;
  });

  let result = null;
  if (subsetFiltered.length === 0) {
    result = null;
  } else if (subsetFiltered.length === 1) {
    result = subsetFiltered[0].display;
  } else {
    const scored = subsetFiltered.map((item) => {
      let score = 0;
      if (PERCENT_RE.test(item.display)) {
        score += 3;
      }
      if (FIBER_RE.test(item.display)) {
        score += 2;
      }
      if (item.display.includes(":")) {
        score += 2;
      }
      if (item.display.length > 220) {
        score -= 2;
      }
      if (/(soft|premium|comfortable|perfect|everyday)/i.test(item.display)) {
        score -= 2;
      }

      return { ...item, score };
    }).sort((a, b) => b.score - a.score || b.display.length - a.display.length);

    const top = scored[0];
    const second = scored[1];

    if (top && second && top.score >= second.score + 2) {
      result = top.display;
    } else {
      result = scored.slice(0, MAX_MATERIAL_ENTRIES).map((item) => item.display).join(" • ");
    }
  }

  if (DEBUG_MATERIALS) {
    console.groupCollapsed(`[materials] postProcess ${contextLabel}`);
    console.log("raw:", rawMaterials);
    console.log("entries:", entries);
    console.log("deduped:", deduped.map((item) => item.display));
    console.log("subsetFiltered:", subsetFiltered.map((item) => item.display));
    console.log("result:", result);
    console.groupEnd();
  }

  return result;
}

function hasProductType(value) {
  if (typeof value === "string") {
    return /(^|\b)(product|productgroup)(\b|$)/i.test(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasProductType(item));
  }

  return false;
}

function parseJsonLdMaterials() {
  const explicitHits = new Set();
  const descriptionHits = new Set();
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');

  const checkNode = (node, fromVariant = false) => {
    if (!node || typeof node !== "object") {
      return;
    }

    const isProductNode = fromVariant || hasProductType(node["@type"]);

    if (isProductNode) {
      for (const [key, value] of Object.entries(node)) {
        if (MATERIAL_FIELD_RE.test(key)) {
          addMaterialEntry(explicitHits, value);
          if (explicitHits.size >= MAX_MATERIAL_ENTRIES) {
            break;
          }
        }
      }

      if (explicitHits.size < MAX_MATERIAL_ENTRIES) {
        const properties = node.additionalProperty || node.additionalProperties;
        const list = Array.isArray(properties) ? properties : [properties];

        for (const prop of list) {
          if (!prop || typeof prop !== "object") {
            continue;
          }

          const propName = normalizeText(String(prop.name || ""));
          if (MATERIAL_NAME_RE.test(propName)) {
            addMaterialEntry(explicitHits, prop.value);
            if (explicitHits.size >= MAX_MATERIAL_ENTRIES) {
              break;
            }
          }
        }
      }

      if (explicitHits.size === 0 && descriptionHits.size < MAX_MATERIAL_ENTRIES) {
        const descriptionEntries = toMaterialEntries(node.description);
        for (const entry of descriptionEntries) {
          if (isMaterialCandidate(entry)) {
            descriptionHits.add(entry);
            if (descriptionHits.size >= MAX_MATERIAL_ENTRIES) {
              break;
            }
          }
        }
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === "hasVariant") {
        if (Array.isArray(value)) {
          for (const variant of value) {
            checkNode(variant, true);
          }
        } else {
          checkNode(value, true);
        }
        continue;
      }

      if (key === "@graph") {
        if (Array.isArray(value)) {
          for (const graphNode of value) {
            checkNode(graphNode, fromVariant);
          }
        } else {
          checkNode(value, fromVariant);
        }
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
            checkNode(item, fromVariant);
          }
        }
      } else if (value && typeof value === "object") {
        checkNode(value, fromVariant);
      }
    }
  };

  for (const script of scripts) {
    const raw = script.textContent || "";
    if (!raw.trim()) {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        checkNode(entry);
      }
    } else {
      checkNode(parsed);
    }
  }

  if (explicitHits.size > 0) {
    const raw = Array.from(explicitHits).slice(0, MAX_MATERIAL_ENTRIES).join(" • ");
    const materials = postProcessMaterials(raw, "jsonld_explicit");
    if (materials) {
      return {
        materials,
        confidence: "high",
        source: "jsonld"
      };
    }
  }

  if (descriptionHits.size > 0) {
    const raw = Array.from(descriptionHits).slice(0, MAX_MATERIAL_ENTRIES).join(" • ");
    const materials = postProcessMaterials(raw, "jsonld_description");
    if (materials) {
      return {
        materials,
        confidence: "medium",
        source: "jsonld"
      };
    }
  }

  return {
    materials: null,
    confidence: "none",
    source: "none"
  };
}

function sentencePunctCount(text) {
  return (text.match(/[.!?]/g) || []).length;
}

function hasLabeledSpecs(text) {
  return /(^|[•|\n])\s*(shell|lining|body|fabric|trim|pocket|fill|outer|inner)\s*:/i.test(text);
}

function looksLikeDescriptionBlob(text, score = materialScore(text)) {
  return Boolean(text) && text.length > 350 && score < 20 && /[.!?]/.test(text);
}

function materialScore(resultString) {
  if (!resultString) {
    return 0;
  }

  let score = 0;
  if (PERCENT_RE.test(resultString)) {
    score += 10;
  }

  const fiberMatches = resultString.match(FIBER_MATCH_RE);
  if (fiberMatches) {
    score += fiberMatches.length * 2;
  }

  const digitMatches = resultString.match(/\d/g);
  if (digitMatches) {
    score += Math.min(4, digitMatches.length);
  }

  const len = resultString.length;
  let lengthPenalty = 0;
  if (len > 220) {
    lengthPenalty += 8;
  }
  if (len > 350) {
    lengthPenalty += 8;
  }

  const punctCount = sentencePunctCount(resultString);
  let punctuationPenalty = 0;
  if (punctCount >= 1) {
    punctuationPenalty += 4;
  }
  if (punctCount >= 2) {
    punctuationPenalty += 6;
  }

  if (/(cozy|warm|embrace|hugged|revamped|designed in-house|authentic touch|no-gimmicks|elegant)/i.test(resultString)) {
    score -= 6;
  }

  if (hasLabeledSpecs(resultString)) {
    lengthPenalty = Math.max(0, lengthPenalty - 4);
    punctuationPenalty = Math.max(0, punctuationPenalty - 2);
  }

  score -= lengthPenalty;
  score -= punctuationPenalty;

  if (resultString.length < 6) {
    score -= 5;
  }

  return score;
}

function confidenceForMaterials(materials) {
  if (!materials) {
    return "none";
  }

  if (PERCENT_RE.test(materials)) {
    return "high";
  }

  if (FIBER_RE.test(materials)) {
    return "medium";
  }

  return "low";
}

function buildResultFromHits(hits, source) {
  if (!hits || hits.length === 0) {
    return null;
  }

  const raw = hits.slice(0, MAX_MATERIAL_ENTRIES).join(" • ");
  const materials = postProcessMaterials(raw, source);
  if (!materials) {
    return null;
  }

  return {
    materials,
    confidence: confidenceForMaterials(materials),
    source
  };
}

function collectLeafHits() {
  const hits = new Set();
  const leafNodes = document.querySelectorAll("li, dd, p, span, td");

  for (const node of leafNodes) {
    const text = normalizeText(node.innerText || node.textContent || "");

    if (text.length === 0 || text.length > 1200) {
      continue;
    }

    addMaterialHitsFromText(hits, text);
    if (hits.size >= MAX_MATERIAL_ENTRIES) {
      break;
    }
  }

  return Array.from(hits);
}

function collectContainerHits() {
  const hits = new Set();
  const containers = document.querySelectorAll("section, article, div");

  for (const container of containers) {
    const rawText = (container.innerText || container.textContent || "").trim();

    if (!rawText || rawText.length > 8000) {
      continue;
    }

    const chunks = rawText.split(/\n+|•|·|\|/);
    for (const chunk of chunks) {
      const text = normalizeText(chunk);

      if (text.length === 0 || text.length > 220) {
        continue;
      }

      addMaterialHitsFromText(hits, text);
      if (hits.size >= MAX_MATERIAL_ENTRIES) {
        return Array.from(hits);
      }
    }
  }

  return Array.from(hits);
}

function extractMaterials() {
  const jsonLdResult = parseJsonLdMaterials();
  const domLeafResult = buildResultFromHits(collectLeafHits(), "dom_leaf");
  const domContainerResult = buildResultFromHits(collectContainerHits(), "dom_container");

  const candidates = [jsonLdResult, domLeafResult, domContainerResult]
    .filter((result) => result?.materials)
    .filter((candidate) => !looksLikeDescriptionBlob(candidate.materials));

  if (candidates.length === 0) {
    return {
      materials: null,
      confidence: "none",
      source: "none"
    };
  }

  const best = candidates.reduce((top, current) => {
    if (!top) {
      return current;
    }

    return materialScore(current.materials) > materialScore(top.materials) ? current : top;
  }, null);

  if (DEBUG_MATERIALS) {
    console.groupCollapsed("[materials] candidates");
    console.table(candidates.map((c) => {
      const score = materialScore(c.materials);
      return {
        source: c.source,
        confidence: c.confidence,
        score,
        length: (c.materials || "").length,
        sentencePunctCount: sentencePunctCount(c.materials || ""),
        looksLikeDescription: looksLikeDescriptionBlob(c.materials, score),
        materials: c.materials
      };
    }));
    console.log("best:", best?.source, best?.materials);
    console.groupEnd();
  }

  return {
    materials: best.materials,
    confidence: best.confidence || confidenceForMaterials(best.materials),
    source: best.source
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "EXTRACT_MATERIALS") {
    sendResponse(extractMaterials());
  }
});
