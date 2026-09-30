/**
 * 룰 세트 편집 화면 스타일(캔버스·툴바·패널·디버거). page.tsx 가 React 19 `<style href precedence>` 로 문서에 한 번만 넣는다.
 *
 * 로컬 `.css` import 를 쓰지 않는 까닭(Ruling 14, Local-Rules §17): tsup 이 그것을 dist 의 `pages/dme/ruleSetEdit/page.css` 로
 * 따로 뽑는데 포털 호스트(m-mcm)는 m-* 모듈 페이지의 CSS 를 불러오지 않아 캔버스 높이가 0 이 됐다.
 * React Flow 기본 스타일(`@xyflow/react/dist/style.css`)은 외부 패키지라 호스트가 묶으므로 `canvas/react-flow.ts` 에 그대로 둔다.
 * 색은 의미 토큰만 쓴다. 한 변 색 바는 쓰지 않는다(Local-Rules §8).
 *
 * 3단계(계획 Task 0 Step 12)부터 본문은 `styles/` 의 영역별 상수로 나눴다 — 각 태스크는 자기 영역 파일만 고친다
 * (base 기본 · drag 끌기 · menu 메뉴·찾기 · props 속성 패널 · debug 디버그 모드 · collapse 접기·중단점 · route 선 경로 손잡이 · space 공간 넓히기). 이 파일은 순서대로 잇기만 한다.
 */
import { BASE_CSS } from "./styles/base";
import { COLLAPSE_CSS } from "./styles/collapse";
import { DEBUG_CSS } from "./styles/debug";
import { DRAG_CSS } from "./styles/drag";
import { MENU_CSS } from "./styles/menu";
import { PROPS_CSS } from "./styles/props";
import { ROUTE_CSS } from "./styles/route";
import { SPACE_CSS } from "./styles/space";

export const RSF_STYLE_HREF = "rsf-flow-styles";

export const RSF_CSS = [BASE_CSS, DRAG_CSS, MENU_CSS, PROPS_CSS, DEBUG_CSS, COLLAPSE_CSS, ROUTE_CSS, SPACE_CSS].join("\n");
