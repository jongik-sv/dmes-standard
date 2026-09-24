package com.dongkuk.dmes.mdm.common.mastercode;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeSamples.entry;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemProjection.Change;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemProjection.Result;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeItemProjection.RowStatus;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** TSK-06-03 design.md §4.2 P1~P5 — 요청 행을 V 모습에 메모리로 적용한다(§6.4). */
class MasterCodeItemProjectionTest {

    private static final List<MasterCodeItemEntry> VIEW = List.of(
            entry("A", "에이", 1, null),
            entry("B", "비", 2, null));

    @Test
    void P1_V_에_이미_있는_코드를_추가하면_SEGMENT_OVERLAP() {
        Result r = MasterCodeItemProjection.apply(VIEW, List.of(row("ADDED", "A", "새 에이")));

        assertEquals(List.of("SEGMENT_OVERLAP"), codes(r.issues()));
        assertEquals("A", r.issues().get(0).itemKey());
    }

    @Test
    void P1_한_요청에_같은_코드_추가가_둘이면_SEGMENT_OVERLAP() {
        Result r = MasterCodeItemProjection.apply(VIEW, List.of(row("ADDED", "C", "씨1"), row("ADDED", "C", "씨2")));

        assertEquals(List.of("SEGMENT_OVERLAP"), codes(r.issues()));
        assertEquals("C", r.issues().get(0).itemKey());
    }

    @Test
    void P2_없는_코드의_수정_삭제는_CODE_NOT_FOUND() {
        Result changed = MasterCodeItemProjection.apply(VIEW, List.of(row("CHANGED", "Z", "제트")));
        Result deleted = MasterCodeItemProjection.apply(VIEW, List.of(row("DELETED", "Z", null)));

        assertEquals(List.of("CODE_NOT_FOUND"), codes(changed.issues()));
        assertEquals(List.of("CODE_NOT_FOUND"), codes(deleted.issues()));
        assertEquals("Z", deleted.issues().get(0).itemKey());
    }

    @Test
    void P3_같은_요청에서_삭제_뒤_다시_추가하면_이슈_없이_새_값이_된다() {
        Result r = MasterCodeItemProjection.apply(VIEW, List.of(row("DELETED", "A", null), row("ADDED", "A", "다시 에이")));

        assertEquals(List.of(), r.issues());
        assertEquals("다시 에이", find(r, "A").values().name());
        assertEquals(Set.of("A"), r.touched());
    }

    @Test
    void P4_적용_순서는_요청_순서와_무관하게_DELETED_CHANGED_ADDED() {
        Result r = MasterCodeItemProjection.apply(VIEW, List.of(
                row("ADDED", "A", "다시 에이"), row("CHANGED", "B", "새 비"), row("DELETED", "A", null)));

        assertEquals(List.of(), r.issues());
        assertEquals(List.of(RowStatus.DELETED, RowStatus.CHANGED, RowStatus.ADDED),
                r.changes().stream().map(Change::status).toList());
        assertEquals("다시 에이", find(r, "A").values().name());
        assertEquals("새 비", find(r, "B").values().name());
        assertEquals(Set.of("A", "B"), r.touched());
    }

    @Test
    void P5_빈_문자열은_null_로_보고_코드는_트림하지_않는다() {
        Map<String, Object> row = row("ADDED", " C", "");
        row.put("alterName", "");
        row.put("description", "");
        row.put("lvl1", "");
        row.put("attr01", "");
        row.put("seq", "");

        Result r = MasterCodeItemProjection.apply(VIEW, List.of(row));

        MasterCodeItemEntry added = find(r, " C");
        assertNull(added.values().name());
        assertNull(added.values().alterName());
        assertNull(added.values().description());
        assertNull(added.values().seq());
        assertNull(added.values().lvls().get(0));
        assertNull(added.values().attrs().get(0));
        assertEquals(5, added.values().lvls().size());
        assertEquals(10, added.values().attrs().size());
    }

    @Test
    void 순서_칸은_숫자와_숫자_문자열을_받는다() {
        Map<String, Object> a = row("ADDED", "C", "씨");
        a.put("seq", 7);
        Map<String, Object> b = row("ADDED", "D", "디");
        b.put("seq", "8");

        Result r = MasterCodeItemProjection.apply(VIEW, List.of(a, b));

        assertEquals(7, find(r, "C").values().seq());
        assertEquals(8, find(r, "D").values().seq());
    }

    @Test
    void 모르는_rowStatus_는_MDM021() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> MasterCodeItemProjection.apply(VIEW, List.of(row("UPSERT", "A", "x"))));

        assertEquals(MdmErrorCode.INVALID_INPUT.code(), e.getErrors().get(0).code());
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private static Map<String, Object> row(String status, String code, String name) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", status);
        m.put("code", code);
        m.put("name", name);
        return m;
    }

    private static MasterCodeItemEntry find(Result r, String code) {
        return r.viewAfter().stream().filter(e -> code.equals(e.code())).findFirst().orElseThrow();
    }

    private static List<String> codes(List<MdmCheckIssue> issues) {
        return issues.stream().map(MdmCheckIssue::code).toList();
    }
}
