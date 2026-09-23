/**
 * @dk-oasis/m-mdm 패키지 배럴.
 *
 * 엔진 공유 계약 타입(TSK-03-01)만 재수출한다 — 런타임 코드 없음. 화면 컴포넌트는 pages/* 서브패스 엔트리로
 * 로드한다(배럴 경유 금지 — 번들 분리 유지, m-mls/m-mqc 관례와 동일).
 */
export type * from "./contract/engine-contract.generated";
