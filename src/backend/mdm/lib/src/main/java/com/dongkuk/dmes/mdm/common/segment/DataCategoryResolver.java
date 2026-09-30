package com.dongkuk.dmes.mdm.common.segment;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import org.springframework.stereotype.Component;

/**
 * REGEX 카테고리 매칭 미리보기·건수(design.md §1, dataCateEdit compare 액션). 열린 항목만 대상(F10·R5) —
 * {@link DataSegmentRowStore#latestItemRows} 를 {@link ItemSegmentRow#isOpen()} 으로 거른다. TABLE 카테고리는
 * {@link DataSegmentRowStore#openMemberCodes} 로 건수를 센다(이 리졸버는 REGEX 전용).
 *
 * <p>{@code targetValue}·{@code matches} 는 {@code DataItemListQuery} 에 있던 것을 그대로 옮긴
 * {@code public static} 다(F20 — null→false, KEY/LVL n/ATTR n 분기가 원본과 글자 그대로 같다. 동작 변경 없는 추출).
 */
@Component
public class DataCategoryResolver {

    /** {@code invalid} 는 {@code defExpr} 문법 오류(compare 액션이 타이핑 중인 정규식을 실시간으로 보낸다, 04 선례).
     * 문법 오류일 때 {@code matches} 는 빈 목록이다. */
    public record Preview(boolean invalid, List<Match> matches) {

        public List<String> codes() {
            return matches.stream().map(Match::code).toList();
        }

        public int count() {
            return matches.size();
        }
    }

    /**
     * 매칭된 항목 한 줄 — 코드와 이름.
     *
     * <p>이름을 함께 주는 이유: {@code dataCateEdit.view} 의 {@code items} 는 TABLE 카테고리에서만 채운다(R5 분기라
     * REGEX 는 비어 있다). 그래서 REGEX 미리보기의 결과로는 코드가 떠도 이름을 되찾을 자리가 화면에 없었고, 소속 목록의
     * 이름 칸이 비어 있었다. 정규식을 돌린 자리에 이름이 이미 있으므로 여기서 함께 준다.
     */
    public record Match(String code, String name) {
    }

    private final DataSegmentRowStore rows;

    public DataCategoryResolver(DataSegmentRowStore rows) {
        this.rows = rows;
    }

    /** {@code defExpr}·{@code defTarget} 에 지금 매칭되는 열린 항목의 키 목록(코드 오름차순 아님 — {@code latestItemRows} 순서). */
    public Preview preview(String maruDataId, String defExpr, String defTarget) {
        Pattern pattern;
        try {
            pattern = Pattern.compile(defExpr);
        } catch (PatternSyntaxException e) {
            return new Preview(true, List.of());
        }
        List<Match> matched = new ArrayList<>();
        for (ItemSegmentRow row : rows.latestItemRows(maruDataId)) {
            if (row.isOpen() && matches(pattern, targetValue(row, defTarget))) {
                matched.add(new Match(row.key().code(), row.value().name()));
            }
        }
        return new Preview(false, matched);
    }

    public static boolean matches(Pattern pattern, String value) {
        return value != null && pattern.matcher(value).matches();
    }

    /** REGEX 대상 칸(KEY·LVL1~5·ATTR01~10)의 값(F20 — {@code DataItemListQuery} 에서 그대로 옮김). */
    public static String targetValue(ItemSegmentRow row, String target) {
        if ("KEY".equals(target)) {
            return row.key().code();
        }
        if (target.startsWith("LVL")) {
            return row.value().lvl(Integer.parseInt(target.substring(3)));
        }
        if (target.startsWith("ATTR")) {
            return row.value().attr(Integer.parseInt(target.substring(4)));
        }
        return null;
    }
}
