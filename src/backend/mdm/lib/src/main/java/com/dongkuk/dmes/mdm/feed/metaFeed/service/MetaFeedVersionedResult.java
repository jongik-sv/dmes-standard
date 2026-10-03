package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * view {@code part=TOC|BODY} 의 결과(D-154, 스펙 §4.1). TOC: {@code {part, items:[{key, value, current}], failed:[{key, message}]}},
 * BODY: {@code {part, items:[{key, ver, value}], failed:[{key, ver, message}]}}. ver 는 늘 scale 3 문자열이다({@link VersionNumbers#plain}).
 */
public record MetaFeedVersionedResult(String part, List<Map<String, Object>> items, List<Map<String, Object>> failed) {

    public Map<String, Object> toResponse() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("part", part);
        out.put("items", items);
        out.put("failed", failed);
        return out;
    }

    static Builder builder(MetaFeedPart part) {
        return new Builder(part.name());
    }

    static final class Builder {

        private final String part;
        private final List<Map<String, Object>> items = new ArrayList<>();
        private final List<Map<String, Object>> failed = new ArrayList<>();

        private Builder(String part) {
            this.part = part;
        }

        /** @param current {@link #current} 결과, 없으면 null */
        Builder toc(String key, Map<String, Object> toc, Map<String, Object> current) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key);
            row.put("value", toc);
            row.put("current", current);
            items.add(row);
            return this;
        }

        Builder tocFailed(String key, String message) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key);
            row.put("message", message);
            failed.add(row);
            return this;
        }

        Builder body(MetaFeedService.BodyKey key, Object value) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key.key());
            row.put("ver", VersionNumbers.plain(key.ver()));
            row.put("value", value);
            items.add(row);
            return this;
        }

        Builder bodyFailed(MetaFeedService.BodyKey key, String message) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", key.key());
            row.put("ver", key.ver() == null ? key.rawVer() : VersionNumbers.plain(key.ver()));
            row.put("message", message);
            failed.add(row);
            return this;
        }

        MetaFeedVersionedResult build() {
            return new MetaFeedVersionedResult(part, items, failed);
        }
    }

    /** 목차 값 {@code {header, versions:[{ver, status, applyFrom, applyTo}]}} — ver 는 scale 3 BigDecimal(JSON number), 시각은 ISO 문자열. */
    static Map<String, Object> toc(Object header, List<Map<String, Object>> versions) {
        Map<String, Object> toc = new LinkedHashMap<>();
        toc.put("header", header);
        toc.put("versions", versions);
        return toc;
    }

    static Map<String, Object> tocVersion(BigDecimal ver, String status, LocalDateTime applyFrom, LocalDateTime applyTo) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("ver", VersionNumbers.scaled(ver));
        row.put("status", status);
        row.put("applyFrom", MetaFeedJson.plain(applyFrom));
        row.put("applyTo", MetaFeedJson.plain(applyTo));
        return row;
    }

    static Map<String, Object> current(BigDecimal ver, Object body) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("ver", VersionNumbers.plain(ver));
        row.put("value", body);
        return row;
    }
}
