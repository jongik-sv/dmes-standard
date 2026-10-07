export function c() {
  // tabId 는 주석에만 있다(주석은 가려지므로 tabId 없음으로 본다)
  window.addEventListener(`portal-tab-activated`, () => reload());
}
