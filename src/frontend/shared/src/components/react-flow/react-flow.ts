// React Flow 진입점 — 이 서브패스의 부품과 화면은 @xyflow/react 대신 이 모듈에서 import 한다(룰 세트 편집기 canvas/react-flow.ts 복사본).
// 외부 패키지 스타일시트는 호스트(Next)가 번들한다(Local-Rules §17 허용). tsup 은 shared dependencies 라 import 를 그대로 남긴다.
export * from "@xyflow/react";
import "@xyflow/react/dist/style.css";
