const pendingSelections = new Map();

async function ensurePickerInjected(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { type: "picker:ping" });
    return;
  } catch (error) {
    await browser.scripting.insertCSS({
      target: { tabId },
      files: ["picker.css"]
    });
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["picker.js"]
    });
  }
}

async function setActionState(tabId, enabled) {
  await browser.action.setBadgeBackgroundColor({
    tabId,
    color: enabled ? "#0f766e" : "#00000000"
  });
  await browser.action.setBadgeText({
    tabId,
    text: enabled ? "ON" : ""
  });
}

async function openSelectionViewer(payload, sourceTab) {
  const id = `selection:${Date.now()}:${crypto.randomUUID()}`;
  pendingSelections.set(id, {
    ...payload,
    capturedAt: new Date().toISOString()
  });

  const createProperties = {
    url: browser.runtime.getURL(`viewer.html?id=${encodeURIComponent(id)}`)
  };

  if (typeof sourceTab?.index === "number") {
    createProperties.index = sourceTab.index + 1;
  }
  if (typeof sourceTab?.windowId === "number") {
    createProperties.windowId = sourceTab.windowId;
  }
  if (typeof sourceTab?.id === "number") {
    createProperties.openerTabId = sourceTab.id;
  }

  await browser.tabs.create(createProperties);
}

browser.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }

  try {
    await ensurePickerInjected(tab.id);
    await browser.tabs.sendMessage(tab.id, { type: "picker:toggle" });
  } catch (error) {
    console.error("Unable to activate picker", error);
    await setActionState(tab.id, false);
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "picker:state" && sender.tab?.id) {
    return setActionState(sender.tab.id, Boolean(message.enabled));
  }

  if (message?.type === "picker:openSelection") {
    if (sender.tab?.id) {
      void setActionState(sender.tab.id, false);
    }
    return openSelectionViewer(message.payload, sender.tab);
  }

  if (message?.type === "viewer:getSelection" && typeof message.id === "string") {
    const selection = pendingSelections.get(message.id) ?? null;
    if (selection) {
      pendingSelections.delete(message.id);
    }
    return Promise.resolve(selection);
  }

  return undefined;
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    void setActionState(tabId, false);
  }
});
