package com.dongkuk.dmes.cactus.mdm;

import java.util.Map;
import java.util.Set;

/**
 * 본문 요청 결과(D-154). {@code found}·{@code failed}(메시지 {@code NOT_RELEASED} 포함)는 새 MDM 응답, {@code legacy}·{@code legacyFailed} 는 옛 MDM
 * 응답(정의 키 → 전 이력). {@code legacyAsked} 는 전 이력으로 물은 정의 키 — 그 안에 있는데 결과에 없으면 MDM 에 없는 정의다.
 */
public record MdmBodyResult(Map<MdmBodyKey, Object> found, Map<MdmBodyKey, String> failed, Map<String, Object> legacy,
                            Map<String, String> legacyFailed, Set<String> legacyAsked) {

    public MdmBodyResult {
        found = found == null ? Map.of() : found;
        failed = failed == null ? Map.of() : failed;
        legacy = legacy == null ? Map.of() : legacy;
        legacyFailed = legacyFailed == null ? Map.of() : legacyFailed;
        legacyAsked = legacyAsked == null ? Set.of() : legacyAsked;
    }

    public static MdmBodyResult legacy(MdmFetchResult r, Set<String> asked) {
        return new MdmBodyResult(Map.of(), Map.of(), r.found(), r.failed(), asked);
    }
}
