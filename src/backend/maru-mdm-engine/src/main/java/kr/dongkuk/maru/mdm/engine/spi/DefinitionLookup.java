package kr.dongkuk.maru.mdm.engine.spi;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 정의 조회 — 도메인 검증 정의(컬럼 단위)와 룰·룰 세트 배포 정의를 돌려준다.
 *
 * <p>원천: 06 「엔진 모듈」 spi 행(06-business-rule.md:461), 배포 스냅샷 항목(06:1156-1165),
 * 「DRAFT와 시험 사본」 구현체 넷(06:541). 어느 버전을 돌려줄지는 구현체가 {@code evalTs} 로 고른다
 * (의존성 규칙 5, 06:471). 엔진은 관리 속성(승인·상태 전이)을 모른다.
 *
 * <p>spi 는 EvalEx 타입과 다른 engine 패키지를 쓰지 않는다(06:461·463). AST 는 {@code Map} 그대로 싣고
 * 엔진은 읽지 않는다(06:471).
 */
public interface DefinitionLookup {

    /** (table, column) 의 검증 정의. 컬럼 사전에 없으면 빈 값. 02 실행 순서 1-4단계가 쓴다. */
    Optional<ColumnDefinition> column(String table, String column);

    /** {@code evalTs} 에 적용되는 RELEASED 버전(값 테스트 구현체는 DRAFT·요청 본문). 없으면 빈 값. */
    Optional<RuleDefinition> rule(String ruleId, Instant evalTs);

    /** 룰 세트 정의(버전 없음). 없으면 빈 값. */
    Optional<RuleSetDefinition> ruleSet(String setId);

    // ------------------------------------------------------------------ 컬럼(도메인 검증)

    /**
     * 06:461 이 정한 항목 + 타입 변환(02 실행 순서 3단계)에 필요한 데이터 타입·소수 자리수.
     *
     * @param effectiveStdExpr  유효 표준식 텍스트(조상 AST 를 AND 로 조립한 파생값, 02 "파생값을 저장하지 않는다"). 없으면 null
     * @param effectiveBizExpr  유효 비즈니스식 텍스트. 없으면 null
     * @param bizRequiredVars   비즈니스식이 요구하는 변수(표준 물리명). 레코드에 없으면 검증 실패(06:448)
     * @param codeRef           CODE 종류 도메인의 유효 코드 참조. 아니면 null
     */
    record ColumnDefinition(
            String table,
            String column,
            DomainKind domainKind,
            DataType dataType,
            Integer scale,
            boolean required,
            String effectiveStdExpr,
            String effectiveBizExpr,
            List<String> bizRequiredVars,
            CodeRef codeRef,
            String refKind,
            String refTarget,
            String refCateId) {}

    /** 유효 코드 참조(마루 코드 ID + 카테고리 ID, 04 「활용처 참조」). */
    record CodeRef(String maruCodeId, String cateId) {}

    /** 02 도메인 종류(02:608·834). */
    enum DomainKind { QTY, CODE, ID, TEXT, DATE, FLAG }

    /** 엔진이 다루는 값 타입(06:126, 06:1014 data_type). DATE 는 결과 변수 선언에만 온다. */
    enum DataType { NUMBER, STRING, BOOLEAN, DATE }

    // ------------------------------------------------------------------ 룰(배포 스냅샷 모양)

    /** 스냅샷 헤더 + 변수 + 입력 계약 + 행(06:1160-1164). */
    record RuleDefinition(
            String ruleId,
            int ver,
            RuleKind ruleKind,
            HitPolicy hitPolicy,
            LocalDateTime applyFrom,
            LocalDateTime applyTo,
            String engineVersion,
            List<RuleVar> vars,
            InputContract contract,
            List<RuleRow> rows) {}

    enum RuleKind { DECISION, DERIVE }

    /** DERIVE 룰은 null(06:975). */
    enum HitPolicy { FIRST, UNIQUE, PRIORITY, COLLECT, ANY }

    enum VarKind { COND, RESULT }

    /** 조건 열 Equal/1/2/Expression, 결과 열 Value/Expression(06:1009). 코드 값은 {@code EQUAL,ONE,TWO,EXPRESSION,VALUE}. */
    enum DispType { EQUAL, ONE, TWO, EXPRESSION, VALUE }

    enum CollectAgg { LIST, SUM, MIN, MAX, COUNT }

    /**
     * 열 하나(06:1003-1022, 스냅샷 변수 행 06:1161).
     *
     * @param varName   표준 물리명·앞 룰 결과 변수·프로그램 변수, 식 변수면 null(식은 {@code exprText}). Expression 조건 열은 null
     * @param exprText  식 변수의 식 텍스트. 엔진이 컴파일해 {@code _V<varId>} 를 계산한다
     * @param exprAst   식 변수 AST(Map). 엔진은 읽지 않는다
     * @param refVars   식 변수가 참조하는 변수
     * @param grpCond   결과 열 그룹의 열 조건 텍스트. 비면 기본 열
     */
    record RuleVar(
            int varId,
            VarKind varKind,
            DispType dispType,
            String varName,
            String exprText,
            Map<String, Object> exprAst,
            List<String> refVars,
            DataType dataType,
            Integer scale,
            String domainId,
            CollectAgg collectAgg,
            List<String> prioList,
            String resGrp,
            String grpCond,
            Map<String, Object> grpCondAst,
            int seq) {}

    enum RowKind { NORMAL, DEFAULT }

    /** 행 하나. {@code cells} 키는 var_id. */
    record RuleRow(int rowId, int seq, RowKind rowKind, Map<Integer, RuleCell> cells) {}

    /**
     * 셀 JSON 일곱 키(06:1038) + 스냅샷의 생성 텍스트 {@code text}(06:1164).
     * op-code 셀은 op·left·right·list + text, Expression 셀은 expr·ast(text = expr), 결과 Value 셀은 val + text(리터럴 식).
     * 모든 값은 문자열이다(06:1038 — JSON 숫자 금지).
     */
    record RuleCell(
            @Nullable String op,
            @Nullable String left,
            @Nullable String right,
            @Nullable List<String> list,
            @Nullable String expr,
            @Nullable Map<String, Object> ast,
            @Nullable String val,
            String text) {}

    /** 입력 계약(06 「입력 계약」, 스냅샷 06:1162). 이름마다 타입을 붙인다. */
    record InputContract(List<VarType> always, List<RowContract> rows) {}

    record RowContract(int rowId, String cond, List<VarType> required, List<VarType> optional) {}

    record VarType(String name, DataType dataType, @Nullable Integer scale, @Nullable String domainId) {}

    /**
     * 세트 스냅샷(06:1165) + 흐름(spec §3.3). {@code flow} 가 null 이면 {@code ruleIds} 순서의 한 줄 흐름이다.
     * {@code ruleIds} 는 흐름을 펼친 룰 목록(깊이 우선, 중복 없음)이고 조회·목록 화면이 쓴다.
     */
    record RuleSetDefinition(String setId, List<String> ruleIds, SetStatus status, @Nullable FlowDefinition flow) {}

    enum SetStatus { CREATED, INUSE, DEPRECATED }

    // ------------------------------------------------------------------ 흐름(룰 세트 흐름도, spec §3)

    /** 흐름 정의 — FLOW_JSON 의 nodes·edges. 화면 전용 view 는 싣지 않는다. {@code version} 은 형식 버전(지금 1). */
    record FlowDefinition(int version, List<FlowNode> nodes, List<FlowEdge> edges) {}

    /** {@code ruleId} 는 RULE 만, {@code splitId}(짝 분기 노드 ID)는 MERGE 만 쓴다. {@code label} 은 화면 표시용. */
    record FlowNode(String id, NodeKind kind, @Nullable String ruleId, @Nullable String splitId, @Nullable String label) {}

    /**
     * {@code order}·{@code cond}·{@code otherwise} 는 IF·PARALLEL 에서 나가는 선만 쓴다. {@code otherwise=true} 는 IF 의
     * "그 외" 선이다(JSON 키도 otherwise — {@code else} 는 Java 예약어다, plan D2).
     */
    record FlowEdge(String id, String from, String to, @Nullable Integer order, @Nullable String cond, boolean otherwise,
            @Nullable String label) {}

    enum NodeKind { START, END, RULE, IF, PARALLEL, MERGE }
}
