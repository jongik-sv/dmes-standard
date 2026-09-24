package com.dongkuk.dmes.mdm.dmb.layout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.dmb.layout.LayoutFillKinds.Cell;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutFillKinds.Field;
import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * TSK-05-02 design.md §3.1·§6.2 — 항목 규칙 L01~L08(불변 I5·I6·I7). fill_kind 칸 행렬(F10)의 CLOSED 칸 전부와 REQUIRED 칸
 * 전부를 파라미터로 돈다. 같은 표를 m-mdm {@code tests/layout/fill-kind.test.ts} 가 쓴다.
 */
class LayoutItemRulesTest {

    static final LayoutColumnInfo COIL_ID = col("COIL_ID", "STRING", 20, null);
    static final LayoutColumnInfo COIL_THK = col("COIL_THK", "NUMBER", 3, 1);
    static final LayoutColumnInfo SEND_TIME = col("SNT_SND_HRP", "STRING", 14, null);
    static final LayoutColumnInfo NO_LEN = col("NO_LEN", "STRING", null, null);
    static final Map<String, LayoutColumnInfo> DICT = Map.of(
            COIL_ID.physName(), COIL_ID, COIL_THK.physName(), COIL_THK, SEND_TIME.physName(), SEND_TIME,
            NO_LEN.physName(), NO_LEN);

    static LayoutColumnInfo col(String phys, String type, Integer length, Integer scale) {
        return new LayoutColumnInfo(phys, phys + " 논리명", null, phys + " 논리명", 1L, "도메인 " + phys, type, length, scale, null);
    }

    /** fill_kind 마다 열린 칸만 올바르게 채운 행. */
    static LayoutItemDraft valid(MdmFillKind kind, int seq) {
        return switch (kind) {
            case DATA -> new LayoutItemDraft(seq, "DATA", "COIL_ID", null, null, null, null, null);
            case CONST -> new LayoutItemDraft(seq, "CONST", "COIL_ID", null, null, null, "B0", null);
            case AUTO -> new LayoutItemDraft(seq, "AUTO", "SNT_SND_HRP", null, null, null, "SEND_TIME", null);
            case FILLER -> new LayoutItemDraft(seq, "FILLER", null, null, null, null, null, 25);
        };
    }

    static LayoutItemDraft with(LayoutItemDraft d, Field field, Object value) {
        return new LayoutItemDraft(d.seq(), d.fillKind(),
                field == Field.COLUMN ? (String) value : d.columnPhys(),
                field == Field.TRANS_UNIT ? (String) value : d.transUnit(),
                field == Field.UNIT_ITEM ? (String) value : d.unitItem(),
                field == Field.NUM_FORMAT ? (String) value : d.numFormat(),
                field == Field.DEFAULT_VALUE ? (String) value : d.defaultValue(),
                field == Field.FILLER_LENGTH ? (Integer) value : d.fillerLength());
    }

    static Object sample(Field field) {
        return switch (field) {
            case COLUMN -> "COIL_ID";
            case DEFAULT_VALUE -> "X";
            case FILLER_LENGTH -> 5;
            case TRANS_UNIT -> "mm";
            case UNIT_ITEM -> "UNIT_CD";
            case NUM_FORMAT -> "SIGN=N;ZERO=Y;SCALE=0;WIDTH=4";
        };
    }

    static List<LayoutIssue> check(LayoutItemDraft... items) {
        return LayoutItemRules.check(List.of(items), DICT);
    }

    static List<String> codes(List<LayoutIssue> issues) {
        return issues.stream().map(i -> i.code().name()).toList();
    }

    static Stream<Arguments> closedCells() {
        return Stream.of(
                Arguments.of(MdmFillKind.DATA, Field.DEFAULT_VALUE), Arguments.of(MdmFillKind.DATA, Field.FILLER_LENGTH),
                Arguments.of(MdmFillKind.CONST, Field.FILLER_LENGTH),
                Arguments.of(MdmFillKind.AUTO, Field.FILLER_LENGTH), Arguments.of(MdmFillKind.AUTO, Field.TRANS_UNIT),
                Arguments.of(MdmFillKind.AUTO, Field.UNIT_ITEM),
                Arguments.of(MdmFillKind.FILLER, Field.COLUMN), Arguments.of(MdmFillKind.FILLER, Field.DEFAULT_VALUE),
                Arguments.of(MdmFillKind.FILLER, Field.TRANS_UNIT), Arguments.of(MdmFillKind.FILLER, Field.UNIT_ITEM),
                Arguments.of(MdmFillKind.FILLER, Field.NUM_FORMAT));
    }

    static Stream<Arguments> requiredCells() {
        return Stream.of(
                Arguments.of(MdmFillKind.DATA, Field.COLUMN), Arguments.of(MdmFillKind.CONST, Field.COLUMN),
                Arguments.of(MdmFillKind.AUTO, Field.COLUMN), Arguments.of(MdmFillKind.AUTO, Field.DEFAULT_VALUE),
                Arguments.of(MdmFillKind.FILLER, Field.FILLER_LENGTH));
    }

    @Test
    void 칸_행렬은_F10_표와_같다() {
        // CLOSED·REQUIRED 는 위 두 목록이 전부다 — 나머지 칸은 OPTIONAL
        List<String> closed = closedCells().map(a -> a.get()[0] + "." + a.get()[1]).toList();
        List<String> required = requiredCells().map(a -> a.get()[0] + "." + a.get()[1]).toList();
        List<String> seen = new ArrayList<>();
        for (MdmFillKind k : MdmFillKind.values()) {
            for (Field f : Field.values()) {
                String key = k + "." + f;
                Cell expect = closed.contains(key) ? Cell.CLOSED : required.contains(key) ? Cell.REQUIRED : Cell.OPTIONAL;
                assertEquals(expect, LayoutFillKinds.cell(k, f), key);
                seen.add(key);
            }
        }
        assertEquals(24, seen.size());
    }

    @ParameterizedTest(name = "{0}.{1}")
    @MethodSource("closedCells")
    void 닫힌_칸에_값이_있으면_L02_로_거부한다(MdmFillKind kind, Field field) {
        List<LayoutIssue> issues = check(with(valid(kind, 1), field, sample(field)));
        LayoutIssue l02 = issues.stream().filter(i -> i.code() == LayoutIssueCode.L02).findFirst().orElseThrow(
                () -> new AssertionError(kind + "." + field + " 에 L02 가 없다: " + issues));
        assertEquals(field.key(), l02.field());
        assertEquals(1, l02.seq());
    }

    @ParameterizedTest(name = "{0}.{1}")
    @MethodSource("requiredCells")
    void 필수_칸이_비면_L03_로_거부한다(MdmFillKind kind, Field field) {
        List<LayoutIssue> issues = check(with(valid(kind, 2), field, null));
        LayoutIssue l03 = issues.stream().filter(i -> i.code() == LayoutIssueCode.L03).findFirst().orElseThrow(
                () -> new AssertionError(kind + "." + field + " 에 L03 이 없다: " + issues));
        assertEquals(field.key(), l03.field());
    }

    @Test
    void 열린_칸만_채운_행은_통과한다() {
        for (MdmFillKind k : MdmFillKind.values()) {
            assertEquals(List.of(), check(valid(k, 1)), k.name());
        }
        LayoutItemDraft full = new LayoutItemDraft(1, "DATA", "COIL_THK", "mm", null, "SIGN=N;ZERO=Y;SCALE=1;WIDTH=4", null, null);
        assertEquals(List.of(), check(full));
    }

    @Test
    void fill_kind_가_없거나_모르는_값이면_L03_로_거부한다() {
        assertEquals(List.of("L03"), codes(check(new LayoutItemDraft(1, null, "COIL_ID", null, null, null, null, null))));
        assertEquals(List.of("L03"), codes(check(new LayoutItemDraft(1, "XYZ", "COIL_ID", null, null, null, null, null))));
    }

    @Test
    void L01_컬럼_사전에_없는_컬럼은_거부한다() {
        List<LayoutIssue> issues = check(new LayoutItemDraft(3, "DATA", "NOPE_X", null, null, null, null, null));
        assertEquals(List.of("L01"), codes(issues));
        assertTrue(issues.get(0).message().contains("NOPE_X"), issues.get(0).message());
        assertEquals(3, issues.get(0).seq());
    }

    @Test
    void L04_AUTO_종류가_네_가지가_아니면_거부한다() {
        assertEquals(List.of("L04"), codes(check(new LayoutItemDraft(1, "AUTO", "SNT_SND_HRP", null, null, null, "NOW", null))));
        for (String ok : List.of("SEND_TIME", "MSG_LENGTH", "SEQ", "LAYOUT_ID")) {
            assertEquals(List.of(), check(new LayoutItemDraft(1, "AUTO", "SNT_SND_HRP", null, null, null, ok, null)), ok);
        }
        assertEquals(List.of("SEND_TIME", "MSG_LENGTH", "SEQ", "LAYOUT_ID"), LayoutFillKinds.AUTO_KINDS);
    }

    @Test
    void L05_전송_단위와_단위_항목을_함께_넣으면_거부한다() {
        assertEquals(List.of("L05"), codes(check(new LayoutItemDraft(1, "DATA", "COIL_THK", "mm", "UNIT_CD", null, null, null))));
    }

    @Test
    void L06_같은_레이아웃에_같은_컬럼을_두_번_쓰면_거부한다() {
        List<LayoutIssue> issues = check(valid(MdmFillKind.DATA, 1), valid(MdmFillKind.CONST, 2));
        assertEquals(List.of("L06"), codes(issues));
        assertEquals(2, issues.get(0).seq());
    }

    @Test
    void L07_도메인_길이가_없으면_거부한다() {
        assertEquals(List.of("L07"), codes(check(new LayoutItemDraft(1, "DATA", "NO_LEN", null, null, null, null, null))));
        // 숫자 표현 자리수가 있으면 길이를 거기서 얻는다 — 단 숫자 도메인만(L08)
        assertEquals(List.of("L08"), codes(check(new LayoutItemDraft(1, "DATA", "NO_LEN", null, null,
                "SIGN=N;ZERO=Y;SCALE=0;WIDTH=4", null, null))));
    }

    @Test
    void L08_숫자가_아닌_도메인에_숫자_표현_형식을_넣으면_거부한다() {
        List<LayoutIssue> issues = check(new LayoutItemDraft(1, "DATA", "COIL_ID", null, null, "SIGN=N;ZERO=Y;SCALE=0;WIDTH=4", null, null));
        assertEquals(List.of("L08"), codes(issues));
        assertEquals("NUM_FORMAT", issues.get(0).field());
    }

    @Test
    void L08_표현_형식_문자열이_깨졌으면_거부한다() {
        assertEquals(List.of("L08"), codes(check(new LayoutItemDraft(1, "DATA", "COIL_THK", null, null, "ZERO=Y;SIGN=N", null, null))));
    }

    @Test
    void L08_암묵_소수_자리가_0도_도메인_소수도_아니면_거부한다() {
        assertEquals(List.of("L08"), codes(check(new LayoutItemDraft(1, "DATA", "COIL_THK", null, null, "SIGN=N;ZERO=Y;SCALE=2;WIDTH=4", null, null))));
        assertEquals(List.of(), check(new LayoutItemDraft(1, "DATA", "COIL_THK", null, null, "SIGN=N;ZERO=Y;SCALE=0;WIDTH=4", null, null)));
    }

    @Test
    void FILLER_길이는_1_이상이어야_한다() {
        List<LayoutIssue> issues = check(new LayoutItemDraft(1, "FILLER", null, null, null, null, null, 0));
        assertEquals(List.of("L03"), codes(issues));
        assertEquals("FILLER_LENGTH", issues.get(0).field());
    }

    @Test
    void 이슈는_행_순서대로_모두_모은다() {
        List<LayoutIssue> issues = check(new LayoutItemDraft(1, "DATA", "NOPE_A", null, null, null, "X", null),
                new LayoutItemDraft(2, "FILLER", "COIL_ID", null, null, null, null, 3));
        assertEquals(List.of("L02", "L01", "L02"), codes(issues));
    }
}
