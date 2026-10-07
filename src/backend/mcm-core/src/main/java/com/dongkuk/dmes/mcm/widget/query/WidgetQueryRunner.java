package com.dongkuk.dmes.mcm.widget.query;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 쿼리 위젯 실행 계약(스펙 2026-10-02-widget-admin-generic §7). 구현은 {@code widget.query} 패키지의 실행기 하나.
 * 사용자 시스템 변수(:userId·:deptCd 등)는 구현이 인증 컨텍스트에서 채운다 — 호출자는 사용자를 넘기지 않는다.
 * 사용자 입력 조건 값({@code values})은 정의의 {@code params} 선언으로 구현이 다시 해석한다(바인드 변수로만 SQL 에 들어간다).
 * 검사·실행 실패는 {@code BusinessException} 으로 던진다.
 */
public interface WidgetQueryRunner {

    /**
     * 저장된 정의(defId)를 입력 조건 값 없이 실행한다 — 입력 조건이 없는 호출자(챗봇 도구 등)용. {@link #runDefinition(String, int, Map)} 에 빈 값을 넘긴다.
     *
     * @param maxRows 행 상한(위젯 500, 챗봇 도구 50)
     */
    default WidgetQueryResult runDefinition(String defId, int maxRows) {
        return runDefinition(defId, maxRows, Map.of());
    }

    /**
     * 저장된 정의(defId)를 실행한다. 정의가 사용 중이고 유형이 query-* 일 때만 실행한다.
     * 요청 본문의 SQL 은 어떤 경우에도 받지 않는다(W-D23).
     *
     * @param maxRows 행 상한(위젯 500, 챗봇 도구 50)
     * @param values  입력 조건 이름 → 글자 값. 정의에 선언되지 않은 이름·SQL 이 쓰지 않는 이름은 읽지 않는다
     */
    WidgetQueryResult runDefinition(String defId, int maxRows, Map<String, String> values);

    /**
     * 관리자 저장 전 시험 실행(commWidgetMng/previewQuery). 같은 SQL 검사를 거치고 결과 캐시를 쓰지 않는다.
     * 오류 메시지에 DB 메시지를 담아도 된다(SQL 작성 도움 — §7.3). 입력 조건 정의 없이 실행한다.
     */
    default WidgetQueryResult preview(String dataSrc, String sql, int maxRows) {
        return preview(dataSrc, sql, maxRows, null);
    }

    /**
     * 시험 실행 + 입력 조건. paramDefsJson 은 CONFIG_JSON 의 params 배열(정의)을 담은 JSON 글자(없으면 조건 없음).
     * 값은 각 정의의 default 를 쓰고, 값이 없는 필수 조건도 거절하지 않고 형을 붙인 null 로 바인드한다(컬럼 확인이 목적).
     */
    WidgetQueryResult preview(String dataSrc, String sql, int maxRows, String paramDefsJson);

    /**
     * 저장 전 검사(§7.1) — 한 문장 SELECT·WITH, 금지 낱말 없음, 알려진 시스템 변수만. 어기면 {@code BusinessException}
     * (ErrorCode.INVALID_VALUE, 사람이 읽을 메시지). 위젯관리 save 가 쿼리 유형 정의를 저장할 때 부른다.
     * 실행·미리보기와 같은 판정이라, 읽기 전용 트랜잭션을 걸 수 없는 DB(Oracle 이 아닌 갈래)에서 전용 연결이 없으면 저장도 거절한다(BUSINESS_ERROR).
     */
    void validateSql(String sql);

    /**
     * 저장 전 검사 + 입력 조건. declaredNames 에 든 이름은 사용자 바인드로 통과시키고(정확히 일치할 때만), 시스템 변수 외 선언 없는 변수는 거절한다.
     *
     * @return SQL 이 쓰는 사용자 입력 조건 이름(처음 나온 순서, 중복 없음)
     */
    List<String> validateSql(String sql, Set<String> declaredNames);

    /**
     * 정시 수집 SQL 저장 전 검사(스펙 2026-10-05 정시 수집 §2) — {@link #validateSql(String)} 와 같고, 수집에는 사용자가 없으므로
     * {@code :userId}·{@code :deptCd} 를 거절한다. 사용자 입력 조건({@code :name})도 없다.
     */
    void validateCollectSql(String sql);

    /**
     * 정시 수집기용 실행 — 사용자 없이(인증 컨텍스트를 읽지 않는다) 읽기 전용 실행기로 돌린다. 같은 SQL 검사·{@link #validateCollectSql} 규칙을 거치고
     * 결과 캐시는 쓰지 않는다. 실패는 {@code BusinessException}(고정 문구, DB 메시지는 서버 로그에만).
     *
     * @param maxRows 행 상한(수집은 50)
     */
    WidgetQueryResult runCollect(String sql, int maxRows);
}
