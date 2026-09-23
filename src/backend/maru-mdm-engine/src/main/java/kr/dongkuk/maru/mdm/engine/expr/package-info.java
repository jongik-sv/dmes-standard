/**
 * 수식(Expression) 평가 — EvalEx 를 감싸는 얇은 계층.
 *
 * <p>계약(TSK-03-01: 설정 고정값·함수 집합·예약 이름·AST·오류 타입) + 구현(TSK-03-02: 설정 팩토리, 컴파일 캐시·
 * {@code copy()}·타임아웃을 갖춘 평가기 {@code MdmEvaluator}, 저장 시 검사, {@code AstExporter}, {@code MASTER} 계열·
 * {@code INSTR}, 타입 변환 진입점 {@code ValueConverter}). 이 패키지에는 record·enum 을 새로 두지 않는다 —
 * 스키마 대조 영구 테스트가 expr 의 record·enum 을 모두 스키마와 맞춘다.
 */
package kr.dongkuk.maru.mdm.engine.expr;
