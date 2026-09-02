/**
 * 전역 CSS import 타입 선언.
 * 정적 side-effect import(`import "x.css"`)는 TS 가 검사하지 않지만,
 * 동적 import(`import("x.css")` — module-config 의 모듈 패키지 dist CSS 로드)는
 * 모듈 해석을 요구하므로 와일드카드 선언이 필요하다. 실제 처리는 Next 번들러가 담당.
 */
declare module "*.css";
