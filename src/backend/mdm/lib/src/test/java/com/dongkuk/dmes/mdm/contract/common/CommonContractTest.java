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
            assertTrue(Set.of(400, 403, 409, 500).contains(code.httpStatus()), code + " 의미 HTTP 상태");
        }
        assertEquals(26, MdmErrorCode.values().length);
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
    void TSK_04_04_가_더한_오류_코드_여섯_개() {
        // TSK-04-04 design.md §6.11(D2) — 컬럼 사전·용어 인라인 등록. 화면에는 message 만 오므로(F12) 문구가 계약이다.
        assertCode(MdmErrorCode.STD_ADMIN_ROLE_REQUIRED, "MDM016", 403,
                com.dongkuk.dmes.cactus.common.ErrorCode.ACCESS_DENIED, "표준 관리자 역할이 있어야 할 수 있습니다");
        assertCode(MdmErrorCode.NAME_PLACEHOLDER_REMAINS, "MDM017", 400,
                com.dongkuk.dmes.cactus.common.ErrorCode.INVALID_VALUE, "미등록 용어(***)가 남아 있어 저장할 수 없습니다");
        assertCode(MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED, "MDM018", 409,
                com.dongkuk.dmes.cactus.common.ErrorCode.DUPLICATE_DATA, "한 시스템 안에서 필드명 하나는 컬럼 하나에만 붙일 수 있습니다");
        assertCode(MdmErrorCode.COLUMN_DUPLICATED, "MDM019", 409,
                com.dongkuk.dmes.cactus.common.ErrorCode.DUPLICATE_DATA, "같은 논리명 또는 물리명의 컬럼이 이미 있습니다");
        assertCode(MdmErrorCode.TERM_DUPLICATED, "MDM020", 409,
                com.dongkuk.dmes.cactus.common.ErrorCode.DUPLICATE_DATA, "같은 표기·의미 번호 또는 영문 약어의 용어가 이미 있습니다");
        assertCode(MdmErrorCode.INVALID_INPUT, "MDM021", 400,
                com.dongkuk.dmes.cactus.common.ErrorCode.INVALID_VALUE, "입력값이 올바르지 않습니다");
    }

    @Test
    void TSK_06_03_이_더한_코드_편집_거부_코드_두_개() {
        // TSK-06-03 design.md D5 — 코드 행 저장 검사(MDM022)·경미 수정 거부(MDM023). 세부는 이슈 코드로 싣는다.
        assertCode(MdmErrorCode.CODE_SAVE_REJECTED, "MDM022", 400,
                com.dongkuk.dmes.cactus.common.ErrorCode.BUSINESS_ERROR, "코드 저장 검사를 통과하지 못했습니다");
        assertCode(MdmErrorCode.CODE_PATCH_REJECTED, "MDM023", 409,
                com.dongkuk.dmes.cactus.common.ErrorCode.BUSINESS_ERROR, "경미 수정을 할 수 없습니다");
    }

    @Test
    void TSK_02_01_D4_1_이_더한_확정_취소_거부_코드() {
        // TSK-02-01 design.md D4-1 / ADR-0002 D8-11 — 이미 적용된 버전을 확정 취소하려 할 때(MDM025).
        assertCode(MdmErrorCode.CONFIRM_CANCEL_NOT_ALLOWED, "MDM025", 409,
                com.dongkuk.dmes.cactus.common.ErrorCode.BUSINESS_ERROR, "이미 적용된 버전은 확정 취소할 수 없습니다");
    }

    @Test
    void TSK_08_06_이_더한_룰_세트_저장_거부_코드() {
        // TSK-08-06 design.md D8 — 룰 세트 저장·되살리기 검사 거부(MDM024). 세부는 이슈 코드로 싣는다.
        assertCode(MdmErrorCode.RULE_SET_SAVE_REJECTED, "MDM024", 400,
                com.dongkuk.dmes.cactus.common.ErrorCode.BUSINESS_ERROR, "룰 세트 저장 검사를 통과하지 못했습니다");
    }

    @Test
    void 룰_세트_흐름도_2단계가_더한_저장값_손상_코드() {
        // P-D9(spec §9.1-9) — 저장된 룰 정의(셀·AST·FLOW_JSON)를 읽지 못함. 입력 오류(MDM021)가 아니라 데이터 손상이라 의미 상태 500.
        assertCode(MdmErrorCode.STORED_DEFINITION_CORRUPT, "MDM026", 500,
                com.dongkuk.dmes.cactus.common.ErrorCode.BUSINESS_ERROR, "저장된 룰 정의를 읽을 수 없습니다");
    }

    private static void assertCode(MdmErrorCode code, String id, int status,
                                   com.dongkuk.dmes.cactus.common.ErrorCode transport, String message) {
        assertEquals(id, code.code());
        assertEquals(status, code.httpStatus());
        assertEquals(transport, code.transport());
        assertEquals(message, code.defaultMessage());
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
    void 방언은_SQLITE_하나다_운영_DB_미정() {
        assertEquals(List.of("SQLITE"), Arrays.stream(MdmDialect.values()).map(Enum::name).toList());
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
