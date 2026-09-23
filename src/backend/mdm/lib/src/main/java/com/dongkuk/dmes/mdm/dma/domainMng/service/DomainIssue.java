package com.dongkuk.dmes.mdm.dma.domainMng.service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 검사 이슈 한 건. {@code field} 는 DB 칼럼명(예: {@code STD_RULE}), {@code itemKey} 는 테스트 케이스 순번(0부터) 또는
 * 하위 도메인 id. {@code message} 는 기능설계서 문구 뒤에 세부를 붙인 것이다.
 */
public record DomainIssue(DomainIssueCode code, String field, String itemKey, String message) {

    public static DomainIssue of(DomainIssueCode code, String field, String itemKey, String detail) {
        String message = detail == null || detail.isBlank() ? code.label() : code.label() + " — " + detail;
        return new DomainIssue(code, field, itemKey, message);
    }

    public static DomainIssue of(DomainIssueCode code, String field, String detail) {
        return of(code, field, null, detail);
    }

    public boolean isError() {
        return code.level() == DomainIssueCode.Level.ERROR;
    }

    /** 화면 검사 목록 행(L-041) — {@code CODE, LEVEL, FIELD, ITEM_KEY, MESSAGE}. */
    public Map<String, Object> toRow() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("CODE", code.name());
        m.put("LEVEL", code.level().name());
        m.put("FIELD", field);
        m.put("ITEM_KEY", itemKey);
        m.put("MESSAGE", message);
        return m;
    }
}
