const PERCENT_RE = /\b\d{1,3}\s*%/;
const FIBER_RE = /(cotton|linen|wool|silk|polyester|nylon|spandex|elastane|viscose|rayon|acrylic|lyocell|tencel|modal|cashmere|hemp|leather|suede|down|alpaca|mohair)/i;
const EXCLUDE_RE = /(save|discount|subscribe|sign up|coupon|reward|sale|% off)/i;

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
}

function isMaterialCandidate(text) {
  return Boolean(text) && PERCENT_RE.test(text) && FIBER_RE.test(text) && !EXCLUDE_RE.test(text);
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
