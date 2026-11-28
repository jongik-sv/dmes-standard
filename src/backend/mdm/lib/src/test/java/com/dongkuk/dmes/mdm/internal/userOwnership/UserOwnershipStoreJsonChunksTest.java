package com.dongkuk.dmes.mdm.internal.userOwnership;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * 여러 사용자 바인드 — JSON 배열 문자열을 바이트 상한 안으로 나누고(VARCHAR2 바인드 4000바이트), 빈 값·중복을 빼고, 따옴표·역슬래시를 이스케이프한다.
 */
class UserOwnershipStoreJsonChunksTest {

    @Test
    void 빈_값과_중복은_빼고_한_배열에_담는다() {
        assertEquals(List.of("[\"u1\",\"u2\"]"), UserOwnershipStore.jsonChunks(Arrays.asList("u1", null, " ", "u2", "u1"), 100));
    }

    @Test
    void 목록이_비면_부르지_않도록_빈_목록이다() {
        assertEquals(List.of(), UserOwnershipStore.jsonChunks(List.of(), 100));
        assertEquals(List.of(), UserOwnershipStore.jsonChunks(Arrays.asList("", null), 100));
    }

    @Test
    void 따옴표와_역슬래시와_제어_문자를_이스케이프한다() {
        assertEquals(List.of("[\"a\\\"b\",\"c\\\\d\",\"e\\u0009f\"]"), UserOwnershipStore.jsonChunks(List.of("a\"b", "c\\d", "e\tf"), 100));
    }

    @Test
    void 바이트_상한을_넘지_않게_나누고_빠진_값이_없다() {
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 2500; i++) {
            ids.add("user-" + i + (i % 7 == 0 ? "-한글" : "")); // 한글은 UTF-8 3바이트
        }

        List<String> chunks = UserOwnershipStore.jsonChunks(ids, UserOwnershipStore.MAX_JSON_BYTES);

        assertTrue(chunks.size() > 1, "나뉘어야 한다: " + chunks.size());
        List<String> back = new ArrayList<>();
        for (String c : chunks) {
            assertTrue(c.getBytes(StandardCharsets.UTF_8).length <= UserOwnershipStore.MAX_JSON_BYTES, "상한 초과: " + c.length());
            assertTrue(c.startsWith("[\"") && c.endsWith("\"]"), c);
            for (String s : c.substring(2, c.length() - 2).split("\",\"")) {
                back.add(s);
            }
        }
        assertEquals(ids, back);
    }

    @Test
    void 경계에서_정확히_상한이면_한_배열에_담는다() {
        // ["ab","cd"] = 11바이트
        assertEquals(List.of("[\"ab\",\"cd\"]"), UserOwnershipStore.jsonChunks(List.of("ab", "cd"), 11));
        assertEquals(List.of("[\"ab\"]", "[\"cd\"]"), UserOwnershipStore.jsonChunks(List.of("ab", "cd"), 10));
    }
}
