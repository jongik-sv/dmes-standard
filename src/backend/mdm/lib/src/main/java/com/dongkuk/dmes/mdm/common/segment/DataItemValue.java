package com.dongkuk.dmes.mdm.common.segment;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

/**
 * 항목 선분 행의 업무 값 스냅샷 — name·alter_name·seq·description + lvl1~5 + attr01~10(S5 의 비교 필드 19개).
 *
 * <p>생성자가 정규화한다(S5): 문자열은 trim 하고 빈 문자열은 NULL 로 본다. {@code lvl} 은 5개, {@code attr} 는 10개로
 * 맞춘다(빠진 칸은 NULL — 05 페이로드 규칙 "빠진 번호는 NULL"). 그래서 {@code "  "} 와 {@code null} 은 같은 값이다.
 */
public record DataItemValue(String name, String alterName, Integer seq, String description, List<String> lvl,
                            List<String> attr) {

    public static final int LVL_COUNT = 5;
    public static final int ATTR_COUNT = 10;

    public DataItemValue {
        name = clean(name);
        alterName = clean(alterName);
        description = clean(description);
        lvl = fixed(lvl, LVL_COUNT);
        attr = fixed(attr, ATTR_COUNT);
    }

    /** 정규화된 값을 만든다(생성자와 같다 — 호출 쪽에서 의도를 드러내는 이름). */
    public static DataItemValue normalized(String name, String alterName, Integer seq, String description,
                                           List<String> lvl, List<String> attr) {
        return new DataItemValue(name, alterName, seq, description, lvl, attr);
    }

    /** 1부터 5까지의 번호로 계층 칸을 읽는다. */
    public String lvl(int no) {
        return lvl.get(no - 1);
    }

    /** 1부터 10까지의 번호로 추가 컬럼을 읽는다. */
    public String attr(int no) {
        return attr.get(no - 1);
    }

    /** 값을 채운 앞쪽 계층 칸(중간 칸 검사 전이면 NULL 뒤 값은 빠진다). */
    public List<String> lvlChain() {
        List<String> chain = new ArrayList<>(LVL_COUNT);
        for (String v : lvl) {
            if (v == null) {
                break;
            }
            chain.add(v);
        }
        return chain;
    }

    /** S5 — 비교 필드 19개가 모두 같으면 같은 행이다. */
    public boolean sameAs(DataItemValue other) {
        if (other == null) {
            return false;
        }
        if (!Objects.equals(name, other.name) || !Objects.equals(alterName, other.alterName)
                || !Objects.equals(seq, other.seq) || !Objects.equals(description, other.description)) {
            return false;
        }
        for (int i = 1; i <= LVL_COUNT; i++) {
            if (!Objects.equals(lvl(i), other.lvl(i))) {
                return false;
            }
        }
        for (int i = 1; i <= ATTR_COUNT; i++) {
            if (!Objects.equals(attr(i), other.attr(i))) {
                return false;
            }
        }
        return true;
    }

    static String clean(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static List<String> fixed(List<String> values, int size) {
        List<String> out = new ArrayList<>(size);
        for (int i = 0; i < size; i++) {
            out.add(values != null && i < values.size() ? clean(values.get(i)) : null);
        }
        return Collections.unmodifiableList(out);
    }
}
