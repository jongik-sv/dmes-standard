package kr.dongkuk.maru.mdm.engine.testsupport;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 마루 코드 고정 데이터(TSK-03-02 design.md §3.2). {@link #procCd()} 는 {@code sql/04-code-exists.sql} 의 INSERT 그대로에
 * BASE 의 {@code def_target = CODE}(04:95)를 더한 것이다. 나머지는 경계 사례용 보조 데이터다.
 */
public final class CodeFixtures {

    public static final String PROC_CD = "PROC_CD";
    public static final String STEEL = "STEEL";
    public static final String SEQ_CD = "SEQ_CD";

    public static final BigDecimal V1_000 = ver("1.000");
    public static final BigDecimal V1_001 = ver("1.001");
    public static final BigDecimal V1_002 = ver("1.002");
    public static final BigDecimal OPEN_VER = ver("9999");
    public static final LocalDateTime OPEN_DT = LocalDateTime.parse("9999-12-31T00:00:00");

    private CodeFixtures() {}

    /** 04:666-690 예제 PROC_CD. v1.000 에 81·82·83, v1.001 에 84 와 COATING(TABLE: 82·84), v1.002 에 COATING 83. */
    public static CodeRows procCd() {
        return new CodeRows(
                new CodeHeader(PROC_CD, "INUSE"),
                List.of(
                        new CodeVersionRow(V1_000, "RELEASED", dt("2025-01-01T00:00"), dt("2026-07-01T00:00")),
                        new CodeVersionRow(V1_001, "RELEASED", dt("2026-07-01T00:00"), dt("2026-09-01T00:00")),
                        new CodeVersionRow(V1_002, "RELEASED", dt("2026-09-01T00:00"), OPEN_DT)),
                List.of(
                        item("81", V1_000, "산세", null),
                        item("82", V1_000, "2CGL", null),
                        item("83", V1_000, "3CGL", null),
                        item("84", V1_001, "4CGL", null)),
                List.of(
                        new CodeCateRow("BASE", V1_000, OPEN_VER, "REGEX", ".*", "CODE"),
                        new CodeCateRow("COATING", V1_001, OPEN_VER, "TABLE", null, null)),
                List.of(
                        new CodeCateItemRow("COATING", "82", V1_001, OPEN_VER),
                        new CodeCateItemRow("COATING", "84", V1_001, OPEN_VER),
                        new CodeCateItemRow("COATING", "83", V1_002, OPEN_VER)));
    }

    /** 버전 하나의 status 를 바꾼 사본. */
    public static CodeRows withVersionStatus(CodeRows rows, BigDecimal ver, String status) {
        List<CodeVersionRow> versions = rows.versions().stream()
                .map(v -> v.ver().compareTo(ver) == 0 ? new CodeVersionRow(v.ver(), status, v.applyFrom(), v.applyTo()) : v)
                .toList();
        return new CodeRows(rows.header(), versions, rows.items(), rows.categories(), rows.cateItems());
    }

    /** 모든 버전의 status 를 바꾼 사본. */
    public static CodeRows withAllVersionStatus(CodeRows rows, String status) {
        List<CodeVersionRow> versions = rows.versions().stream()
                .map(v -> new CodeVersionRow(v.ver(), status, v.applyFrom(), v.applyTo()))
                .toList();
        return new CodeRows(rows.header(), versions, rows.items(), rows.categories(), rows.cateItems());
    }

    public static CodeRows withHeaderStatus(CodeRows rows, String status) {
        return new CodeRows(new CodeHeader(rows.header().maruCodeId(), status), rows.versions(), rows.items(),
                rows.categories(), rows.cateItems());
    }

    public static CodeRows withCategory(CodeRows rows, CodeCateRow category) {
        List<CodeCateRow> categories = new ArrayList<>(rows.categories());
        categories.add(category);
        return new CodeRows(rows.header(), rows.versions(), rows.items(), categories, rows.cateItems());
    }

    /**
     * 보조 코드 STEEL — REGEX 대상 칸(CODE·LVL·ATTR) 사례용. 버전 1.000 하나(2025-01-01 부터 열림).
     * 82: lvl2 {@code KS-3}, attr01 {@code KR} / 83: lvl·attr 없음.
     * 카테고리: CODE_8X(CODE {@code 8[0-9]}), CODE_8(CODE {@code 8}), LVL2_KS3(LVL2 {@code KS-3}),
     * ATTR01_KR(ATTR01 {@code ^KR$}), ATTR01_ANY(ATTR01 {@code .*}).
     */
    public static CodeRows steel() {
        return new CodeRows(
                new CodeHeader(STEEL, "INUSE"),
                List.of(new CodeVersionRow(V1_000, "RELEASED", dt("2025-01-01T00:00"), OPEN_DT)),
                List.of(
                        new CodeItemRow("82", V1_000, OPEN_VER, "SS400", null, 1, lvl("KS", "KS-3"), attrs("KR")),
                        item("83", V1_000, "SM490", null)),
                List.of(
                        new CodeCateRow("BASE", V1_000, OPEN_VER, "REGEX", ".*", "CODE"),
                        new CodeCateRow("CODE_8X", V1_000, OPEN_VER, "REGEX", "8[0-9]", "CODE"),
                        new CodeCateRow("CODE_8", V1_000, OPEN_VER, "REGEX", "8", "CODE"),
                        new CodeCateRow("LVL2_KS3", V1_000, OPEN_VER, "REGEX", "KS-3", "LVL2"),
                        new CodeCateRow("ATTR01_KR", V1_000, OPEN_VER, "REGEX", "^KR$", "ATTR01"),
                        new CodeCateRow("ATTR01_ANY", V1_000, OPEN_VER, "REGEX", ".*", "ATTR01")),
                List.of());
    }

    /** 보조 코드 SEQ_CD — CODE_LIST 정렬 사례. seq 2·1·NULL·1 이 섞여 있다. */
    public static CodeRows seqCd() {
        return new CodeRows(
                new CodeHeader(SEQ_CD, "INUSE"),
                List.of(new CodeVersionRow(V1_000, "RELEASED", dt("2025-01-01T00:00"), OPEN_DT)),
                List.of(
                        new CodeItemRow("A", V1_000, OPEN_VER, "가", null, 2, lvl(), attrs()),
                        new CodeItemRow("B", V1_000, OPEN_VER, "나", "ㄴ", null, lvl(), attrs()),
                        new CodeItemRow("C", V1_000, OPEN_VER, "다", null, 1, lvl(), attrs()),
                        new CodeItemRow("D", V1_000, OPEN_VER, "라", null, 1, lvl(), attrs()),
                        new CodeItemRow("E", V1_000, OPEN_VER, "마", null, null, lvl(), attrs())),
                List.of(new CodeCateRow("BASE", V1_000, OPEN_VER, "REGEX", ".*", "CODE")),
                List.of());
    }

    public static CodeItemRow item(String code, BigDecimal fromVer, String name, String attr01) {
        return new CodeItemRow(code, fromVer, OPEN_VER, name, null, null, lvl(), attrs(attr01));
    }

    /** lvl1-lvl5, 길이 5(빈 칸 null). {@code List.of} 는 null 을 받지 않아 {@code Arrays.asList} 로 만든다. */
    public static List<String> lvl(String... values) {
        return Arrays.asList(Arrays.copyOf(values, 5));
    }

    /** attr01-attr10, 길이 10(빈 칸 null). */
    public static List<String> attrs(String... values) {
        return Arrays.asList(Arrays.copyOf(values, 10));
    }

    public static BigDecimal ver(String v) {
        return new BigDecimal(v).setScale(3);
    }

    public static LocalDateTime dt(String iso) {
        return LocalDateTime.parse(iso);
    }
}
