const resultEl = document.getElementById("result");
const metaEl = document.getElementById("meta");

function setErrorState(message) {
  resultEl.textContent = message;
  metaEl.textContent = "";
}

function renderExtraction(result) {
  if (result?.materials) {
    resultEl.textContent = `Materials: ${result.materials}`;
    metaEl.textContent = `Source: ${result.source} · Confidence: ${result.confidence}`;
    return;
  }

  resultEl.textContent = "No materials found on this page";
  metaEl.textContent = "Source: DOM";
}

async function requestMaterials() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      setErrorState("No active tab available");
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_MATERIALS" });
    renderExtraction(response);
  } catch (_error) {
    setErrorState("No materials found on this page");
  }
}

requestMaterials();
