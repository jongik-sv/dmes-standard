package com.dongkuk.dmes.mcm.widget.query;

/**
 * 쿼리 위젯 실행 계약(스펙 2026-10-02-widget-admin-generic §7). 구현은 {@code widget.query} 패키지의 실행기 하나.
 * 사용자 시스템 변수(:userId·:deptCd 등)는 구현이 인증 컨텍스트에서 채운다 — 호출자는 사용자를 넘기지 않는다.
 * 검사·실행 실패는 {@code BusinessException} 으로 던진다.
 */
public interface WidgetQueryRunner {

    /**
     * 저장된 정의(defId)를 실행한다. 정의가 사용 중이고 유형이 query-* 일 때만 실행한다.
     * 요청 본문의 SQL 은 어떤 경우에도 받지 않는다(W-D23).
     *
     * @param maxRows 행 상한(위젯 500, 챗봇 도구 50)
     */
    WidgetQueryResult runDefinition(String defId, int maxRows);

    /**
     * 관리자 저장 전 시험 실행(commWidgetMng/previewQuery). 같은 SQL 검사를 거치고 결과 캐시를 쓰지 않는다.
     * 오류 메시지에 DB 메시지를 담아도 된다(SQL 작성 도움 — §7.3).
     */
    WidgetQueryResult preview(String dataSrc, String sql, int maxRows);
}
