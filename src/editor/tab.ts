/* Remembers this editor tab so the toolbar button can focus it instead of opening a second one (rule 2). */
type Api = typeof chrome;
const api: Api | undefined = (globalThis as unknown as { browser?: Api }).browser ?? (globalThis as unknown as { chrome?: Api }).chrome;

export function registerEditorTab() {
  if (!api?.tabs?.getCurrent || !api.storage?.session) return;
  api.tabs.getCurrent((tab) => {
    if (tab?.id === undefined) return;
    api.storage.session.set({ editorTab: tab.id });
    window.addEventListener('pagehide', () => {
      api.storage.session.get('editorTab').then((v) => {
        if (v.editorTab === tab.id) api.storage.session.remove('editorTab');
      });
    });
  });
}
