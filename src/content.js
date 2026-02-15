const PERCENT_RE = /\b\d{1,3}\s*%/;
const FIBER_RE = /(cotton|linen|wool|silk|polyester|nylon|spandex|elastane|viscose|rayon|acrylic|lyocell|tencel|modal|cashmere|hemp|leather|suede|down|alpaca|mohair)/i;
const EXCLUDE_RE = /(save|discount|subscribe|sign up|coupon|reward|sale|% off)/i;
const MATERIAL_FIELD_RE = /^(material|materials|fabric|composition)$/i;
const MATERIAL_NAME_RE = /(material|materials|fabric|composition)/i;
const MAX_MATERIAL_ENTRIES = 4;

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
}

function isMaterialCandidate(text) {
  return Boolean(text) && PERCENT_RE.test(text) && FIBER_RE.test(text) && !EXCLUDE_RE.test(text);
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
    return {
      materials: Array.from(explicitHits).slice(0, MAX_MATERIAL_ENTRIES).join(" • "),
      confidence: "high",
      source: "jsonld"
    };
  }

  if (descriptionHits.size > 0) {
    return {
      materials: Array.from(descriptionHits).slice(0, MAX_MATERIAL_ENTRIES).join(" • "),
      confidence: "medium",
      source: "jsonld"
    };
  }

  return {
    materials: null,
    confidence: "none",
    source: "none"
  };
}

function collectLeafHits() {
  const hits = new Set();
  const leafNodes = document.querySelectorAll("li, dd, p, span, td");

  for (const node of leafNodes) {
    const text = normalizeText(node.innerText || node.textContent || "");

    if (text.length === 0 || text.length > 160) {
      continue;
    }

    if (isMaterialCandidate(text)) {
      hits.add(text);
      if (hits.size >= 4) {
        break;
      }
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

      if (isMaterialCandidate(text)) {
        hits.add(text);
        if (hits.size >= 4) {
          return Array.from(hits);
        }
      }
    }
  }

  return Array.from(hits);
}

function extractMaterials() {
  const jsonLdResult = parseJsonLdMaterials();
  if (jsonLdResult.materials) {
    return jsonLdResult;
  }

  const leafHits = collectLeafHits();
  if (leafHits.length > 0) {
    return {
      materials: leafHits.join(" • "),
      confidence: "high",
      source: "dom_leaf"
    };
  }

  const containerHits = collectContainerHits();
  if (containerHits.length > 0) {
    return {
      materials: containerHits.join(" • "),
      confidence: "high",
      source: "dom_container"
    };
  }

  return {
    materials: null,
    confidence: "none",
    source: "none"
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "EXTRACT_MATERIALS") {
    sendResponse(extractMaterials());
  }
});
