package com.dongkuk.dmes.mdm.dma.domainMng.service;

import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainDraftRequest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/** TSK-04-03 단위 테스트용 초안 조립 — 화면이 보내는 요청 DTO + grid 행 모양 그대로 {@link DomainDraft#from} 을 태운다. */
final class DomainDrafts {

    private DomainDrafts() {}

    static DomainDraftRequest request(Consumer<DomainDraftRequest> edit) {
        DomainDraftRequest r = new DomainDraftRequest();
        r.setDomainName("시험 도메인");
        r.setStdName("TEST_DOM");
        r.setDomainKind("TEXT");
        r.setDataType("STRING");
        edit.accept(r);
        return r;
    }

    static DomainDraft draft(Consumer<DomainDraftRequest> edit) {
        return DomainDraft.from(request(edit), List.of(), List.of());
    }

    static DomainDraft draft(Consumer<DomainDraftRequest> edit, List<Map<String, Object>> cases) {
        return DomainDraft.from(request(edit), cases, List.of());
    }

    static Map<String, Object> caseRow(String value, Object expect) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("VALUE", value);
        m.put("EXPECT", expect);
        return m;
    }

    static Map<String, Object> caseRow(String value, Object expect, String varsJson) {
        Map<String, Object> m = caseRow(value, expect);
        m.put("VARS", varsJson);
        return m;
    }

    static List<Map<String, Object>> examples(String... values) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (String v : values) {
            out.add(Map.of("VALUE", v));
        }
        return out;
    }
}
