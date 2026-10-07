package com.dongkuk.dmes.mdm.common.segment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-07-03 design.md C3 — 검사 컴포넌트 단위 시험(스프링 없음). EXTERNAL 원천은 API 경로로만 오고 API 는 행 내용 검사를
 * 건너뛰므로(C0) 코어를 거친 시험으로는 "EXTERNAL 에도 키 패턴 적용" 변이가 드러나지 않는다. 검사 자체의 원천 분기를
 * 직접 확인한다.
 */
class DataItemChecksTest {

    private final DataItemChecks checks = new DataItemChecks();

    @Test
    void C3_키_패턴은_MDM_원천의_신규_키에만_적용한다() {
        List<String> noLabels = Collections.nCopies(10, null);
        LockedMaruData mdm = new LockedMaruData("PORT", "INUSE", "MDM", null, "^[0-9A-Z]{1,20}$", 0, noLabels);
        LockedMaruData external = new LockedMaruData("CUST", "INUSE", "EXTERNAL", "ERP", "^[0-9A-Z]{1,20}$", 0, noLabels);
        DataItemValue value = new DataItemValue("이름", null, null, null, List.of(), List.of());

        assertEquals(List.of(), codes(checks.rowIssues(external, "lower key", value, true)));
        assertEquals(List.of("CHK3"), codes(checks.rowIssues(mdm, "lower key", value, true)));
        assertEquals(List.of(), codes(checks.rowIssues(mdm, "lower key", value, false)), "수정은 키를 다시 검사하지 않는다");
        assertTrue(checks.rowIssues(mdm, "KRPUS", value, true).isEmpty());
    }

    @Test
    void L1_키_50자는_통과하고_51자는_LEN() {
        LockedMaruData mdm = mdm();
        DataItemValue value = new DataItemValue("이름", null, null, null, List.of(), List.of());

        assertEquals(List.of(), codes(checks.rowIssues(mdm, "K".repeat(50), value, true)));
        assertEquals(List.of("LEN"), codes(checks.rowIssues(mdm, "K".repeat(51), value, true)));
    }

    @Test
    void L1_계층_칸_50자는_통과하고_51자는_LEN() {
        LockedMaruData mdm = mdm();
        DataItemValue ok = new DataItemValue("이름", null, null, null, List.of("G".repeat(50)), List.of());
        DataItemValue over = new DataItemValue("이름", null, null, null, List.of("G".repeat(51)), List.of());

        assertEquals(List.of(), codes(checks.rowIssues(mdm, "A", ok, false)));
        List<MdmCheckIssue> issues = checks.rowIssues(mdm, "A", over, false);
        assertEquals(List.of("LEN"), codes(issues));
        assertEquals("lvl1", issues.get(0).field());
    }

    @Test
    void L2_이름_계열_4000바이트는_통과하고_4001바이트_한글_1334자는_LEN() {
        LockedMaruData mdm = mdm();
        DataItemValue ok = new DataItemValue("a".repeat(4000), "가".repeat(1333), null, "d".repeat(4000), List.of(),
                List.of());
        assertEquals(List.of(), codes(checks.rowIssues(mdm, "A", ok, false)));

        DataItemValue over = new DataItemValue("a".repeat(4001), "가".repeat(1334), null, "d".repeat(4001), List.of(),
                List.of());
        List<MdmCheckIssue> issues = checks.rowIssues(mdm, "A", over, false);
        assertEquals(List.of("LEN", "LEN", "LEN"), codes(issues));
        assertEquals(List.of("name", "alterName", "description"),
                issues.stream().map(MdmCheckIssue::field).toList());
    }

    @Test
    void L2_추가_컬럼_4001바이트는_LEN() {
        LockedMaruData withLabel = new LockedMaruData("PORT", "INUSE", "MDM", null, "^[0-9A-Z]{1,20}$", 0,
                java.util.Arrays.asList("라벨", null, null, null, null, null, null, null, null, null));
        DataItemValue over = new DataItemValue("이름", null, null, null, List.of(), List.of("a".repeat(4001)));
        DataItemValue ok = new DataItemValue("이름", null, null, null, List.of(), List.of("a".repeat(4000)));

        assertEquals(List.of(), codes(checks.rowIssues(withLabel, "A", ok, false)));
        List<MdmCheckIssue> issues = checks.rowIssues(withLabel, "A", over, false);
        assertEquals(List.of("LEN"), codes(issues));
        assertEquals("attr01", issues.get(0).field());
    }

    @Test
    void L4_API_경로는_행_내용은_건너뛰어도_길이_이슈는_낸다() {
        LockedMaruData external = new LockedMaruData("CUST", "INUSE", "EXTERNAL", "ERP", "^[0-9A-Z]{1,20}$", 0,
                Collections.nCopies(10, null));
        DataItemValue over = new DataItemValue("a".repeat(4001), null, null, null, List.of("G".repeat(51)), List.of());
        HierarchyIndex index = HierarchyIndex.of(List.of());

        List<MdmCheckIssue> issues = checks.contentIssues(DataSavePath.API, external, "K".repeat(51), over, true, index);

        assertEquals(List.of("LEN", "LEN", "LEN"), codes(issues));
        assertEquals(List.of("code", "name", "lvl1"), issues.stream().map(MdmCheckIssue::field).toList());
        DataItemValue ok = new DataItemValue("이름", null, null, null, List.of("G".repeat(50)), List.of());
        assertEquals(List.of(), checks.contentIssues(DataSavePath.API, external, "K".repeat(50), ok, true, index));
        assertEquals(List.of(), checks.contentIssues(DataSavePath.API, external, "K".repeat(51), ok, false, index),
                "수정은 저장된 키를 그대로 쓴다");
    }

    @Test
    void L4_SCREEN_CSV_경로는_길이_이슈가_한_번만_나온다() {
        LockedMaruData mdm = mdm();
        DataItemValue over = new DataItemValue("a".repeat(4001), null, null, null, List.of("G".repeat(51)), List.of());
        HierarchyIndex index = HierarchyIndex.of(List.of());

        for (DataSavePath path : List.of(DataSavePath.SCREEN, DataSavePath.CSV)) {
            List<MdmCheckIssue> issues = checks.contentIssues(path, mdm, "K".repeat(51), over, true, index);
            assertEquals(List.of("LEN", "LEN", "LEN"), codes(issues), path.name());
            assertEquals(List.of("code", "name", "lvl1"), issues.stream().map(MdmCheckIssue::field).toList(), path.name());
        }
    }

    @Test
    void L3_카테고리_정의_길이_상한() {
        DataCateValue ok = new DataCateValue("가".repeat(1333), "REGEX", "a".repeat(4000), "KEY", "d".repeat(4000));
        assertEquals(List.of(), codes(checks.cateDefIssues("C".repeat(50), ok)));

        DataCateValue over = new DataCateValue("가".repeat(1334), "REGEX", "a".repeat(4001), "KEY", "d".repeat(4001));
        List<MdmCheckIssue> issues = checks.cateDefIssues("C".repeat(51), over);
        assertEquals(List.of("LEN", "LEN", "LEN", "LEN"), codes(issues));
        assertEquals(List.of("cateId", "cateName", "defExpr", "description"),
                issues.stream().map(MdmCheckIssue::field).toList());
    }

    private static LockedMaruData mdm() {
        return new LockedMaruData("PORT", "INUSE", "MDM", null, ".*", 5, Collections.nCopies(10, null));
    }

    private static List<String> codes(List<MdmCheckIssue> issues) {
        return issues.stream().map(MdmCheckIssue::code).toList();
    }
}
