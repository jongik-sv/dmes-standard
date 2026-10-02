package com.dongkuk.dmes.cactus.mdm;

import java.util.Map;

/**
 * metaFeed view 결과 — 찾은 키의 값(대상 종류별 타입)과 MDM 이 정의를 만들지 못한 키·이유. 없는 키는 둘 다에 없다. null 맵은 빈 맵으로 받는다
 * (조회 서비스에서 NPE 가 새지 않게).
 */
public record MdmFetchResult(Map<String, Object> found, Map<String, String> failed) {

    public MdmFetchResult {
        found = found == null ? Map.of() : found;
        failed = failed == null ? Map.of() : failed;
    }
}
