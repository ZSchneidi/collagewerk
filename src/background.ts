/* Toolbar button: open the editor in a full tab, or focus the open one (rule 2). Self-contained: no imports. */
type Api = typeof chrome;
const api: Api = (globalThis as unknown as { browser?: Api }).browser ?? chrome;

async function openEditor() {
  const url = api.runtime.getURL('editor.html');
  const { editorTab } = await api.storage.session.get('editorTab');
  if (typeof editorTab === 'number') {
    try {
      const tab = await api.tabs.get(editorTab);
      await api.tabs.update(editorTab, { active: true });
      if (tab.windowId !== undefined) await api.windows.update(tab.windowId, { focused: true });
      return;
    } catch {
      await api.storage.session.remove('editorTab');
    }
  }
  await api.tabs.create({ url });
}

api.action.onClicked.addListener(() => {
  void openEditor();
});
