export function b() {
  window.addEventListener('portal-tab-activated', (e) => { if (e.detail.tabId !== tabId) return; reload(); });
}
