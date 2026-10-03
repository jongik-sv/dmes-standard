package com.dongkuk.dmes.cactus.mdm;

import java.util.Map;

/**
 * 목차 요청 결과(D-154). {@code tocs}·{@code current} 는 새 MDM 응답, {@code legacy} 는 옛 MDM(신호 가·나) 응답의 전 이력 값(지금 값 모양), {@code failed}
 * 는 받을 수 없는 키다. 없는 정의는 어디에도 없다.
 */
public record MdmTocResult(Map<String, MdmToc> tocs, Map<String, MdmCurrent> current, Map<String, Object> legacy,
                           Map<String, String> failed) {

    public MdmTocResult {
        tocs = tocs == null ? Map.of() : tocs;
        current = current == null ? Map.of() : current;
        legacy = legacy == null ? Map.of() : legacy;
        failed = failed == null ? Map.of() : failed;
    }

    public static MdmTocResult legacy(MdmFetchResult r) {
        return new MdmTocResult(Map.of(), Map.of(), r.found(), r.failed());
    }
}
