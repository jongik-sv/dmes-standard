// React Flow 진입점 — 캔버스 컴포넌트는 @xyflow/react 대신 이 모듈에서 import 한다.
// 스타일시트를 불러오는 곳을 한 군데로 모아 호스트 빌드에서 CSS 가 풀리는지 한 곳에서 확인한다.
export * from "@xyflow/react";
import "@xyflow/react/dist/style.css";
