function getSelectionId() {
  const params = new URLSearchParams(location.search);
  return params.get("id");
}

async function loadSelection(id) {
  return browser.runtime.sendMessage({
    type: "viewer:getSelection",
    id
  });
}

function renderMissingState() {
  document.title = "Picked Element Missing";
  document.getElementById("preview").style.display = "none";
  document.getElementById("missing").style.display = "block";
}

async function init() {
  const id = getSelectionId();
  if (!id) {
    renderMissingState();
    return;
  }

  const selection = await loadSelection(id);
  if (!selection) {
    renderMissingState();
    return;
  }

  document.title = selection.selector;
  document.getElementById("preview").srcdoc = selection.renderHtml;
}

void init();
