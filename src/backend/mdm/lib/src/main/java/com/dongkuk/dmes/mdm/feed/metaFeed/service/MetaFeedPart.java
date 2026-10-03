package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.mdm.common.metarev.MetaTargetType;
import java.util.Locale;

/** metaFeed view 의 {@code part}(D-154, 스펙 §4.1). COLUMN·DOMAIN 은 버전이 없어 늘 NONE 이다(응답에도 part 를 싣지 않는다). */
public enum MetaFeedPart {
    NONE, TOC, BODY;

    static MetaFeedPart of(String text, MetaTargetType type) {
        if (type == MetaTargetType.COLUMN || type == MetaTargetType.DOMAIN || text == null || text.isBlank()) {
            return NONE;
        }
        return switch (text.trim().toUpperCase(Locale.ROOT)) {
            case "TOC" -> TOC;
            case "BODY" -> BODY;
            default -> throw MetaFeedService.invalid("part 는 TOC·BODY 중 하나여야 합니다: " + text);
        };
    }
}
