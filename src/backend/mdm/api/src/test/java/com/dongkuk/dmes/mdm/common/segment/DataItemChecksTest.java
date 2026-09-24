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

    private static List<String> codes(List<MdmCheckIssue> issues) {
        return issues.stream().map(MdmCheckIssue::code).toList();
    }
}
