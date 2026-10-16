package com.dongkuk.dmes.mdm.common.support;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 검사 문제({@link MdmCheckIssue}) → 화면 응답 map. 확정·저장 화면 서비스가 따로 두던 사본의 공용 정본이다.
 *
 * <p>모양이 둘이라 함수도 둘이다. 키 순서는 {@link LinkedHashMap} 이 지키고 화면 JSON 순서가 된다.
 * <ul>
 *   <li>{@link #of(String, MdmCheckIssue)} — 5키 {@code severity·code·message·field·itemKey}. 룰·룰 세트·레이아웃 확정.</li>
 *   <li>{@link #of(MdmCheckIssue)} — 4키 {@code code·message·field·itemKey}(severity 없음). 마스터코드 확정·코드 항목·카테고리 편집.</li>
 * </ul>
 * 두 모양을 하나로 합치면(severity 키를 빼거나 null 로 더하면) 화면이 받는 JSON 이 바뀐다.
 */
public final class MdmCheckIssueMaps {

    private MdmCheckIssueMaps() {
    }

    /** 5키 — severity 를 맨 앞에 둔다. */
    public static Map<String, Object> of(String severity, MdmCheckIssue issue) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("severity", severity);
        put(m, issue);
        return m;
    }

    /** 4키 — severity 키가 없다. */
    public static Map<String, Object> of(MdmCheckIssue issue) {
        Map<String, Object> m = new LinkedHashMap<>();
        put(m, issue);
        return m;
    }

    private static void put(Map<String, Object> m, MdmCheckIssue issue) {
        m.put("code", issue.code());
        m.put("message", issue.message());
        m.put("field", issue.field());
        m.put("itemKey", issue.itemKey());
    }
}
