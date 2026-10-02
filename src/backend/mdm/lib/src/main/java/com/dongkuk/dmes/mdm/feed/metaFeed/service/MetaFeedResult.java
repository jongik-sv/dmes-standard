package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * view 한 번의 결과(spec 2026-10-02 §3.4). {@code found} 값은 {@link MetaFeedJson#plain} 을 거친 평범한 값이다. {@code failed} 는 저장 정의가
 * 깨져 만들 수 없던 키와 이유다(Ruling R4). 없는 키는 둘 다에 없다.
 */
public record MetaFeedResult(Map<String, Object> found, Map<String, String> failed) {

    public static MetaFeedResult empty() {
        return new MetaFeedResult(Map.of(), Map.of());
    }

    /** {@code {items:[{key, value}], failed:[{key, message}]}}. */
    public Map<String, Object> toResponse() {
        List<Map<String, Object>> items = new ArrayList<>();
        found.forEach((key, value) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key);
            row.put("value", value);
            items.add(row);
        });
        List<Map<String, Object>> fails = new ArrayList<>();
        failed.forEach((key, message) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key);
            row.put("message", message);
            fails.add(row);
        });
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("failed", fails);
        return out;
    }
}
