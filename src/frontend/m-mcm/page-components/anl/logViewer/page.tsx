// m-analog 패키지 화면 re-export shim — PAGE_REGISTRY(glob) 등록용.
// 실제 구현은 @dk-oasis/m-analog/pages/anl/logViewer (dist 매핑 — 화면 CSS 는 tsup 추출본을 함께 import).
import "@dk-oasis/m-analog/pages/anl/logViewer.css";
export { default } from "@dk-oasis/m-analog/pages/anl/logViewer";
