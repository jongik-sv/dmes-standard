package com.dongkuk.dmes.mdm.contract.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-02 design.md §3.1 T5 — 시스템 코드·감사 칼럼·오류 코드·방언(불변 규칙 I5·I9·I12).
 */
class CommonContractTest {

    private static final String UPPER_SNAKE = "^[A-Z][A-Z0-9_]*$";

    @Test
    void 시스템_코드_시드는_6종이고_자기_행은_MDM_이다() {
        assertEquals(List.of("ERP", "MES", "APS", "DKMS", "L2", "MDM"), MdmSystemCodes.SEEDED);
        assertEquals("MDM", MdmSystemCodes.SELF);
        assertTrue(MdmSystemCodes.SEEDED.contains(MdmSystemCodes.SELF));
    }

    @Test
    void 감사_칼럼은_9개이고_순서와_네이티브_목록이_규칙표_2절과_같다() {
        assertEquals(List.of("C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID",
                "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID", "VER"), MdmAuditColumns.ALL);
        assertEquals(String.join(", ", MdmAuditColumns.ALL), MdmAuditColumns.NATIVE_COLUMN_LIST);
        for (String column : MdmAuditColumns.ALL) {
            assertTrue(column.matches(UPPER_SNAKE), column);
        }
    }

    @Test
    void 오류_코드는_MDMnnn_형식으로_유일하고_운반용_코드가_있다() {
        Set<String> codes = new HashSet<>();
        for (MdmErrorCode code : MdmErrorCode.values()) {
            assertTrue(code.code().matches("^MDM\\d{3}$"), code + " 코드 형식");
            assertTrue(codes.add(code.code()), code + " 코드 중복: " + code.code());
            assertNotNull(code.transport(), code + " 운반용 cactus ErrorCode");
            assertTrue(code.defaultMessage() != null && !code.defaultMessage().isBlank(), code + " 기본 메시지");
            assertTrue(Set.of(400, 403, 409).contains(code.httpStatus()), code + " 의미 HTTP 상태");
        }
        assertEquals(15, MdmErrorCode.values().length);
    }

    @Test
    void TSK_01_03_이_더한_오류_코드_두_개() {
        // TSK-01-03 D3 — 담당자 역할 거부(MDM013)와 확정 검사 경고 미확인(MDM014).
        assertEquals("MDM013", MdmErrorCode.STEWARD_ROLE_REQUIRED.code());
        assertEquals(403, MdmErrorCode.STEWARD_ROLE_REQUIRED.httpStatus());
        assertEquals(com.dongkuk.dmes.cactus.common.ErrorCode.ACCESS_DENIED, MdmErrorCode.STEWARD_ROLE_REQUIRED.transport());
        assertEquals("MDM014", MdmErrorCode.CONFIRM_WARNINGS_NOT_ACKNOWLEDGED.code());
        assertEquals(409, MdmErrorCode.CONFIRM_WARNINGS_NOT_ACKNOWLEDGED.httpStatus());
        assertEquals(com.dongkuk.dmes.cactus.common.ErrorCode.BUSINESS_ERROR,
                MdmErrorCode.CONFIRM_WARNINGS_NOT_ACKNOWLEDGED.transport());
    }

    @Test
    void TSK_04_03_이_더한_도메인_저장_거부_코드() {
        assertEquals("MDM015", MdmErrorCode.DOMAIN_SAVE_REJECTED.code());
        assertEquals(400, MdmErrorCode.DOMAIN_SAVE_REJECTED.httpStatus());
        assertEquals(com.dongkuk.dmes.cactus.common.ErrorCode.BUSINESS_ERROR, MdmErrorCode.DOMAIN_SAVE_REJECTED.transport());
    }

    @Test
    void row_version_충돌은_409_이고_원천_문구를_그대로_쓴다() {
        assertEquals("MDM001", MdmErrorCode.ROW_VERSION_CONFLICT.code());
        assertEquals(409, MdmErrorCode.ROW_VERSION_CONFLICT.httpStatus());
        assertEquals("다른 사용자가 수정했습니다. 다시 불러오세요", MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage());
        assertEquals("MDM007", MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS.code());
        assertEquals("미적용 버전이 2개입니다. 하나를 삭제하세요", MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS.defaultMessage());
        assertEquals("MDM008", MdmErrorCode.APPLY_FROM_NOT_AFTER_PREVIOUS.code());
        assertEquals(403, MdmErrorCode.NOT_DRAFT_OWNER.httpStatus());
    }

    @Test
    void 방언은_SQLITE_와_MSSQL_이다() {
        assertEquals(List.of("SQLITE", "MSSQL"), Arrays.stream(MdmDialect.values()).map(Enum::name).toList());
    }

    @Test
    void 공통_record_는_필드를_보존한다() {
        Instant at = Instant.parse("2026-09-24T00:00:00Z");
        AuditStamp stamp = new AuditStamp("u1", "svc", "pgm", at);
        assertEquals("u1", stamp.userId());
        assertEquals(at, stamp.at());

        MdmCheckIssue issue = new MdmCheckIssue("MDM008", "msg", "applyFrom", null);
        assertEquals("MDM008", issue.code());
        assertEquals("applyFrom", issue.field());
    }
}
