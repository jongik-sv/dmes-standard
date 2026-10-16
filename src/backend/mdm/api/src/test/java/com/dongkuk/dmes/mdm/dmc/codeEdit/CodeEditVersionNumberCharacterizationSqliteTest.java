package com.dongkuk.dmes.mdm.dmc.codeEdit;

import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.FUTURE;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN_END;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditView;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionCreateRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionRestoreRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.service.CodeEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.math.BigDecimal;
import java.util.Set;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * BE 리팩토링 2회차 C3 특성 시험 — 마루 코드 새 버전({@code createVersion})·복원({@code restoreVersion})의 번호 규칙과 검사 순서를
 * 문구까지 고정한다. 버전 없음·원본 검사가 모두 MDM021 이고 번호 상한도 C3 fix 전에는 MDM021 이었다. 오류 코드만으로는 순서가 안
 * 보여서 문구 전체를 본다. 번호 상한은 C3 fix 로 공통 {@code VersionRules.nextNumber} 의 MDM009 문구가 됐다.
 *
 * <p>지금 순서: 담당자·코드·원천 → 폐기 → 버전 종류 → 미적용 가드(MDM006) → 번호(상한) → 복원 원본 형식·RELEASED → 쓰기.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class CodeEditVersionNumberCharacterizationSqliteTest extends AbstractMdmSharedDbTest {

    private static final String ID = "PROC_CD";
    private static final String OTHER = "B_CD";
    private static final String MAJOR_CAP = "major 를 더 올릴 수 없습니다";
    private static final String MINOR_CAP = "minor 를 더 올릴 수 없습니다. major 를 올리십시오";
    private static final String NO_VERSION = "버전이 없으면 major 만 만들 수 있습니다";
    private static final String KIND = "버전 종류는 MAJOR 또는 MINOR 여야 합니다";
    private static final String SOURCE = "복원 원본은 확정(RELEASED)된 버전이어야 합니다";
    private static final String NO_SOURCE = "버전 번호가 없습니다";
    private static final String DEPRECATED = "폐기된 마루 코드는 새 버전을 만들 수 없습니다";

    @Autowired
    CodeEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager transactionManager;

    private JdbcTemplate jdbc;
    private TransactionTemplate tx;
    private MasterCodeSeeds seeds;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        seeds = new MasterCodeSeeds(jdbc);
        seeds.clear();
        currentUser.set("stw1", Set.of("MDM_STEWARD"));
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void major_상한이면_새_버전과_복원이_MDM009_상한_문구이고_minor_는_된다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "9998.000", PAST, OPEN_END);

        assertFails(MdmErrorCode.TRANSITION_NOT_ALLOWED, MAJOR_CAP, () -> create(ID, "MAJOR"));
        assertFails(MdmErrorCode.TRANSITION_NOT_ALLOWED, MAJOR_CAP, () -> restore(ID, "MAJOR", "9998.000"));
        assertEquals(1, seeds.count("TB_MDM_CODE_VER"));

        CodeEditView v = create(ID, "MINOR");
        assertEquals("9998.001", v.getVersions().get(0).getVer());
    }

    @Test
    void minor_상한이면_새_버전과_복원이_MDM009_상한_문구다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.999", PAST, OPEN_END);

        assertFails(MdmErrorCode.TRANSITION_NOT_ALLOWED, MINOR_CAP, () -> create(ID, "MINOR"));
        assertFails(MdmErrorCode.TRANSITION_NOT_ALLOWED, MINOR_CAP, () -> restore(ID, "MINOR", "1.999"));
        assertEquals(1, seeds.count("TB_MDM_CODE_VER"));
    }

    @Test
    void 버전이_없으면_minor_는_MDM021_이고_복원도_원본보다_이_검사가_먼저다() {
        seeds.seedCode(ID, "CREATED", "MDM");

        assertFails(MdmErrorCode.INVALID_INPUT, NO_VERSION, () -> create(ID, "MINOR"));
        assertFails(MdmErrorCode.INVALID_INPUT, NO_VERSION, () -> restore(ID, "MINOR", "1.000"));
        assertFails(MdmErrorCode.INVALID_INPUT, NO_VERSION, () -> restore(ID, "MINOR", "abc"));
        assertEquals(0, seeds.count("TB_MDM_CODE_VER"));
    }

    /** 설계 시험 6 — 복원 원본이 틀리고 번호도 상한이면 상한 오류가 먼저다(번호를 원본 검사보다 먼저 구한다). */
    @Test
    void 복원_원본이_틀려도_번호_상한_오류가_먼저다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.seedVer(ID, "1.998", "MINOR", "CANCELLED", FUTURE, OPEN_END, "stw1");
        seeds.released(ID, "1.999", PAST, OPEN_END);

        // 상한이 없는 MAJOR 로는 원본 오류가 그대로 보인다.
        assertFails(MdmErrorCode.INVALID_INPUT, SOURCE, () -> restore(ID, "MAJOR", "1.998"));
        assertFails(MdmErrorCode.INVALID_INPUT, SOURCE, () -> restore(ID, "MAJOR", "1.500"));
        assertFails(MdmErrorCode.INVALID_INPUT, "버전 형식이 올바르지 않습니다: abc", () -> restore(ID, "MAJOR", "abc"));
        assertFails(MdmErrorCode.INVALID_INPUT, NO_SOURCE, () -> restore(ID, "MAJOR", null));

        // 같은 원본을 MINOR 상한과 함께 주면 상한 문구다.
        for (String source : new String[] {"1.998", "1.500", "abc", null}) {
            assertFails(MdmErrorCode.TRANSITION_NOT_ALLOWED, MINOR_CAP, () -> restore(ID, "MINOR", source));
        }
        assertEquals(2, seeds.count("TB_MDM_CODE_VER"));

        seeds.seedCode(OTHER, "INUSE", "MDM");
        seeds.released(OTHER, "9998.000", PAST, OPEN_END);
        for (String source : new String[] {"9000.000", "abc", null}) {
            assertFails(MdmErrorCode.TRANSITION_NOT_ALLOWED, MAJOR_CAP, () -> restore(OTHER, "MAJOR", source));
        }
        assertEquals(1, seeds.count("TB_MDM_CODE_VER", OTHER));
    }

    @Test
    void 미적용_버전이_있으면_번호_상한보다_MDM006_이_먼저다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.998", PAST, OPEN_END);
        seeds.draft(ID, "1.999", "stw1");

        MasterCodeSeeds.assertMdmError(MdmErrorCode.UNAPPLIED_VERSION_EXISTS, () -> create(ID, "MINOR"));
        MasterCodeSeeds.assertMdmError(MdmErrorCode.UNAPPLIED_VERSION_EXISTS, () -> restore(ID, "MINOR", "abc"));
        assertEquals(2, seeds.count("TB_MDM_CODE_VER"));
    }

    @Test
    void 복원_번호는_CANCELLED_를_포함한_최대값에서_한다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.seedVer(ID, "1.001", "MINOR", "CANCELLED", FUTURE, OPEN_END, "stw1");
        CodeEditView minor = restore(ID, "MINOR", "1.000");
        assertEquals("1.002", minor.getVersions().get(0).getVer());
        assertEquals("v1.000 복원", minor.getVersions().get(0).getRestoredLabel());

        seeds.seedCode(OTHER, "INUSE", "MDM");
        seeds.released(OTHER, "1.000", PAST, OPEN_END);
        seeds.seedVer(OTHER, "2.000", "MAJOR", "CANCELLED", FUTURE, OPEN_END, "stw1");
        restore(OTHER, "MAJOR", "1.000");
        assertEquals(0, BigDecimal.ONE.compareTo(jdbc.queryForObject(
                "SELECT RESTORED_FROM FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = ? AND VER = 3", BigDecimal.class, OTHER)));
        assertEquals("DRAFT", jdbc.queryForObject(
                "SELECT STATUS FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = ? AND VER = 3", String.class, OTHER));
    }

    @Test
    void 버전_종류는_빈_값도_MDM021_이고_폐기_검사_뒤_미적용_가드_앞이다() {
        seeds.seedCode(ID, "INUSE", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.draft(ID, "1.001", "stw1");

        assertFails(MdmErrorCode.INVALID_INPUT, KIND, () -> create(ID, null));
        assertFails(MdmErrorCode.INVALID_INPUT, KIND, () -> create(ID, " "));
        assertFails(MdmErrorCode.INVALID_INPUT, KIND, () -> restore(ID, "", "1.000"));
        assertFails(MdmErrorCode.INVALID_INPUT, KIND, () -> restore(ID, "PATCH", "abc"));

        seeds.seedCode(OTHER, "DEPRECATED", "MDM");
        seeds.released(OTHER, "1.000", PAST, OPEN_END);
        assertFails(MdmErrorCode.TRANSITION_NOT_ALLOWED, DEPRECATED, () -> create(OTHER, null));
        assertFails(MdmErrorCode.TRANSITION_NOT_ALLOWED, DEPRECATED, () -> restore(OTHER, "PATCH", "abc"));
        assertEquals(3, seeds.count("TB_MDM_CODE_VER"));
    }

    // ── 도우미 ──

    private CodeEditView create(String id, String kind) {
        CodeVersionCreateRequest r = new CodeVersionCreateRequest();
        r.setMaruCodeId(id);
        r.setVerKind(kind);
        return tx.execute(s -> service.createVersion(r));
    }

    private CodeEditView restore(String id, String kind, String source) {
        CodeVersionRestoreRequest r = new CodeVersionRestoreRequest();
        r.setMaruCodeId(id);
        r.setVerKind(kind);
        r.setSourceVer(source);
        return tx.execute(s -> service.restoreVersion(r));
    }

    /** 첫 오류 코드와 문구 전체({@code 기본 문구 + ": " + 상세})를 본다. */
    private static void assertFails(MdmErrorCode code, String detail, Supplier<?> call) {
        BusinessException e = assertThrows(BusinessException.class, call::get);
        assertEquals(code.code(), e.getErrors().get(0).code(), e.getMessage());
        assertEquals(code.defaultMessage() + ": " + detail, e.getMessage());
    }
}
