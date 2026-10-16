package com.dongkuk.dmes.mdm.dmc.codeEdit;

import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.FUTURE;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.OPEN_END;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.PAST2;
import static com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds.assertMdmError;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditView;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionCreateRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionRestoreRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionRow;
import com.dongkuk.dmes.mdm.dmc.codeEdit.service.CodeEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
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
 * C3(BE 리팩토링 2회차) 특성 시험 — 코드 화면의 새 버전 만들기({@code createVersion})와 복원({@code restoreVersion})의
 * 트랜잭션 경계를 고정한다. 훅 이전 전 코드에 걸어 통과시켰고, 훅으로 옮긴 뒤에도 고치지 않고 통과한다.
 *
 * <p>C3 는 두 경로를 common/version 의 새 버전 훅으로 옮겼다. 훅은 가드 → 채번 → 쓰기(복원 원본 검사 포함) → 승격을 한 트랜잭션에서
 * 하고, 그 트랜잭션은 OASIS 트랜잭션에 합류한다. 그래서 시험은 운영처럼 {@link TransactionTemplate} 안에서 서비스를 부르고, 끝난 뒤 DB 행을 본다.
 *
 * <p>고정하는 계약:
 * <ul>
 *   <li>G·R — 가드 오류(MDM006·MDM013·폐기 MDM009·EXTERNAL MDM021)와 틀린 복원 원본(MDM021)은 행을 하나도 쓰지 않는다.
 *       부모는 적용된 RELEASED 가 있어도 CREATED 그대로다.</li>
 *   <li>W — 쓰기 도중 실패(BASE INSERT·선분 복사·부모 승격 UPDATE)는 호출 전체를 되돌린다. VER 행·선분·부모가 그대로다.</li>
 *   <li>O — 바깥 트랜잭션이 롤백되면 성공한 호출의 쓰기도 모두 사라진다. 훅은 따로 커밋하지 않고 바깥 트랜잭션에 합류해야 한다.</li>
 *   <li>S — 성공하면 VER 행 칸, BASE(1.000 에만), 복원 선분, 부모 CREATED→INUSE(엔티티 경로, 감사 카운터 +1)가 이 모습이다.</li>
 * </ul>
 *
 * <p>쓰기 도중 실패는 시험이 잠깐 만드는 트리거로 낸다({@code MasterCodeDraftDeletionSqliteTest} 선례). 메인 코드는 건드리지 않는다.
 * 트리거는 실패 순간 같은 트랜잭션에 이미 쓰인 DRAFT 행 수와 복사 행 수를 오류 문구에 남긴다. 그래서 롤백이 실제로 쓴 행을 지웠다고 확인한다.
 *
 * <p>고정하지 않는 것:
 * <ul>
 *   <li>어느 오류가 바깥 트랜잭션을 rollback-only 로 만드는가. {@code codeEdit.bpmn} 에는 경계 이벤트가 없다. OASIS 는 어떤 오류든
 *       전체를 롤백하므로 운영에서 보이지 않는다.</li>
 *   <li>"원본 ≥ 다음 번호" 인 RELEASED 원본. 다음 번호는 모든 버전보다 크므로 서비스로는 만들 수 없다. 없는 번호로만 들어가고,
 *       그 경우는 R1 이 "없는 원본" 으로 고정한다.</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class CodeEditNewVersionTxCharacterizationSqliteTest extends AbstractMdmSharedDbTest {

    private static final String ID = "PROC_CD";
    private static final String TRIGGER = "TR_C3T_FAIL";

    /** 트리거 본문 — 실패 순간 PROC_CD 의 DRAFT 행 수와 2.000 에서 시작한 ITEM 행 수를 문구에 남기고 실패한다. */
    private static final String FAIL_BODY = "DECLARE n NUMBER; m NUMBER; BEGIN "
            + "SELECT COUNT(*) INTO n FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = 'PROC_CD' AND STATUS = 'DRAFT'; "
            + "SELECT COUNT(*) INTO m FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'PROC_CD' AND FROM_VER = 2; "
            + "RAISE_APPLICATION_ERROR(-20001, 'C3T drafts=' || n || ' copies=' || m); END;";

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

    /** 한 코드의 DB 모습 — VER 행, 세 선분 표, 부모 행(상태·감사 카운터·U_AT 유무). */
    record Snapshot(List<String> vers, List<String> segments, String parent) {
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        tx = new TransactionTemplate(transactionManager);
        seeds = new MasterCodeSeeds(jdbc);
        dropTrigger();
        seeds.clear();
        as("stw1");
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @AfterEach
    void tearDown() {
        dropTrigger();
    }

    /** 저장 CREATED 인데 적용된 RELEASED 1.000 이 있다(승격이 늦은 모습). BASE 와 코드 A 하나. */
    private void createdWithApplied() {
        seeds.seedCode(ID, "CREATED", "MDM");
        seeds.released(ID, "1.000", PAST, OPEN_END);
        seeds.seedBase(ID);
        seeds.seedItem(ID, "A", "1.000", OPEN, "a1", 1);
    }

    /**
     * 저장 CREATED + 둘 다 적용된 RELEASED. 1.000(A a1, B, D, BASE, T t1, (T,A), (T,D)) →
     * 1.001(A a2, B 닫힘, C 추가, T t2, (T,A) 닫힘, (T,C) 추가).
     */
    private void twoReleases() {
        seeds.seedCode(ID, "CREATED", "MDM");
        seeds.released(ID, "1.000", PAST, PAST2);
        seeds.released(ID, "1.001", PAST2, OPEN_END);
        seeds.seedItem(ID, "A", "1.000", "1.001", "a1", 1);
        seeds.seedItem(ID, "A", "1.001", OPEN, "a2", 1);
        seeds.seedItem(ID, "B", "1.000", "1.001", "b1", 2);
        seeds.seedItem(ID, "C", "1.001", OPEN, "c1", 3);
        seeds.seedItem(ID, "D", "1.000", OPEN, "d1", 4);
        seeds.seedBase(ID);
        seeds.seedCate(ID, "T", "1.000", "1.001", "TABLE", null, null, "t1");
        seeds.seedCate(ID, "T", "1.001", OPEN, "TABLE", null, null, "t2");
        seeds.seedCateItem(ID, "T", "A", "1.000", "1.001");
        seeds.seedCateItem(ID, "T", "C", "1.001", OPEN);
        seeds.seedCateItem(ID, "T", "D", "1.000", OPEN);
    }

    // ── G: 가드 오류는 아무 행도 쓰지 않는다 ──

    @Test
    void G1_미적용_DRAFT_가_있으면_새_버전과_복원이_MDM006_이고_아무_행도_쓰지_않는다() {
        createdWithApplied();
        seeds.draft(ID, "1.001", "stw2");
        Snapshot before = snapshot(ID);

        assertMdmError(MdmErrorCode.UNAPPLIED_VERSION_EXISTS, () -> create(ID, "MINOR"));
        assertMdmError(MdmErrorCode.UNAPPLIED_VERSION_EXISTS, () -> create(ID, "MAJOR"));
        assertMdmError(MdmErrorCode.UNAPPLIED_VERSION_EXISTS, () -> restore("MAJOR", "1.000"));

        assertEquals(before, snapshot(ID));
        assertEquals("CREATED|0|null", parent(ID), "가드에서 막히면 적용된 RELEASED 가 있어도 승격하지 않는다");
    }

    @Test
    void G2_담당자_역할이_없으면_MDM013_이고_아무_행도_쓰지_않는다() {
        createdWithApplied();
        Snapshot before = snapshot(ID);
        currentUser.set("stw1", Set.of("MDM_STD_ADMIN"));

        assertMdmError(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> create(ID, "MINOR"));
        assertMdmError(MdmErrorCode.STEWARD_ROLE_REQUIRED, () -> restore("MAJOR", "1.000"));

        assertEquals(before, snapshot(ID));
        assertEquals("CREATED|0|null", parent(ID));
    }

    @Test
    void G3_폐기_코드는_MDM009_EXTERNAL_코드는_MDM021_이고_아무_행도_쓰지_않는다() {
        createdWithApplied();
        jdbc.update("UPDATE TB_MDM_CODE SET STATUS = 'DEPRECATED' WHERE MARU_CODE_ID = ?", ID);
        Snapshot deprecated = snapshot(ID);
        assertMdmError(MdmErrorCode.TRANSITION_NOT_ALLOWED, () -> create(ID, "MINOR"));
        assertMdmError(MdmErrorCode.TRANSITION_NOT_ALLOWED, () -> restore("MAJOR", "1.000"));
        assertEquals(deprecated, snapshot(ID));

        String ext = "EXT_CD";
        seeds.seedCode(ext, "CREATED", "EXTERNAL");
        seeds.released(ext, "1.000", PAST, OPEN_END);
        Snapshot external = snapshot(ext);
        assertMdmError(MdmErrorCode.INVALID_INPUT, () -> create(ext, "MINOR"));
        assertMdmError(MdmErrorCode.INVALID_INPUT, () -> tx.execute(s -> service.restoreVersion(restoreReq(ext, "MAJOR", "1.000"))));
        assertEquals(external, snapshot(ext));
        assertEquals("CREATED|0|null", parent(ext));
    }

    // ── R: 틀린 복원 원본은 아무 행도 쓰지 않는다 ──

    @Test
    void R1_복원_원본이_없거나_RELEASED_가_아니거나_다음_번호_이상이면_MDM021_이고_아무_행도_쓰지_않는다() {
        createdWithApplied();
        seeds.seedVer(ID, "1.001", "MINOR", "CANCELLED", FUTURE, OPEN_END, "stw1"); // 다음 번호: MINOR 1.002, MAJOR 2.000
        Snapshot before = snapshot(ID);

        String[][] cases = {
                {"MAJOR", "1.001"}, // CANCELLED
                {"MAJOR", "1.005"}, // 없는 번호
                {"MINOR", "1.002"}, // 다음 번호와 같다(없는 번호)
                {"MAJOR", "2.000"}, // 다음 번호와 같다(없는 번호)
                {"MAJOR", "3.000"}, // 다음 번호보다 크다(없는 번호)
                {"MAJOR", "abc"},   // 형식 오류
                {"MAJOR", null},    // 빈 값
        };
        for (String[] c : cases) {
            assertMdmError(MdmErrorCode.INVALID_INPUT, () -> restore(c[0], c[1]));
        }

        assertEquals(before, snapshot(ID));
        assertEquals("CREATED|0|null", parent(ID), "원본 검사에서 막히면 승격하지 않는다");
    }

    // ── W: 쓰기 도중 실패는 호출 전체를 되돌린다 ──

    @Test
    void W1_첫_버전의_BASE_INSERT_가_실패하면_먼저_쓴_VER_행도_롤백된다() {
        seeds.seedCode(ID, "CREATED", "MDM"); // 버전 0개 — 다음 MAJOR 는 1.000 이고 BASE 를 같이 만든다
        Snapshot before = snapshot(ID);
        createTrigger("BEFORE INSERT ON TB_MDM_CODE_CATE FOR EACH ROW WHEN (NEW.CATE_ID = 'BASE') ");

        RuntimeException e = assertThrows(RuntimeException.class, () -> create(ID, "MAJOR"));

        assertTrue(messages(e).contains("C3T drafts=1 copies=0"), "VER 1.000 을 쓴 뒤 BASE 에서 실패했다: " + messages(e));
        assertEquals(before, snapshot(ID));
        assertEquals(0, seeds.count("TB_MDM_CODE_VER", ID));
        assertEquals(0, seeds.count("TB_MDM_CODE_CATE", ID));
    }

    @Test
    void W2_복원_선분_복사가_실패하면_VER_행과_먼저_쓴_복사_행이_모두_롤백된다() {
        twoReleases();
        Snapshot before = snapshot(ID);
        createTrigger("BEFORE INSERT ON TB_MDM_CODE_CATE_ITEM FOR EACH ROW ");

        RuntimeException e = assertThrows(RuntimeException.class, () -> restore("MAJOR", "1.000"));

        assertTrue(messages(e).contains("C3T drafts=1 copies=2"),
                "VER 2.000 과 ITEM 복사(A·B)를 쓴 뒤 CATE_ITEM 에서 실패했다: " + messages(e));
        assertEquals(before, snapshot(ID));
        assertEquals("CREATED|0|null", parent(ID), "적용된 RELEASED 가 있어도 CREATED 그대로다");
    }

    @Test
    void W3_새_버전의_부모_승격_UPDATE_가_실패하면_VER_행도_롤백되고_부모는_CREATED_다() {
        createdWithApplied();
        Snapshot before = snapshot(ID);
        createTrigger(promotionTrigger());

        RuntimeException e = assertThrows(RuntimeException.class, () -> create(ID, "MINOR"));

        assertTrue(messages(e).contains("C3T drafts=1 copies=0"), "VER 1.001 을 쓴 뒤 승격에서 실패했다: " + messages(e));
        assertEquals(before, snapshot(ID));
        assertEquals("CREATED|0|null", parent(ID));
    }

    @Test
    void W4_복원의_부모_승격_UPDATE_가_실패하면_VER_행과_복원_선분이_모두_롤백되고_부모는_CREATED_다() {
        twoReleases();
        Snapshot before = snapshot(ID);
        createTrigger(promotionTrigger());

        RuntimeException e = assertThrows(RuntimeException.class, () -> restore("MAJOR", "1.000"));

        assertTrue(messages(e).contains("C3T drafts=1 copies=2"),
                "VER 2.000 과 복원 선분을 모두 쓴 뒤 승격에서 실패했다: " + messages(e));
        assertEquals(before, snapshot(ID));
        assertEquals("CREATED|0|null", parent(ID));
    }

    // ── O: 바깥 트랜잭션 롤백은 성공한 호출도 되돌린다 ──

    @Test
    void O1_바깥_트랜잭션이_롤백되면_성공한_새_버전과_승격도_사라진다() {
        createdWithApplied();
        Snapshot before = snapshot(ID);

        CodeEditView inTx = tx.execute(s -> {
            CodeEditView v = service.createVersion(createReq(ID, "MINOR"));
            s.setRollbackOnly();
            return v;
        });

        CodeVersionRow top = inTx.getVersions().get(0);
        assertEquals("1.001", top.getVer(), "트랜잭션 안에서는 새 DRAFT 가 보인다");
        assertEquals("DRAFT", top.getStatus());
        assertEquals("INUSE", inTx.getHeader().getStoredStatus(), "트랜잭션 안에서는 승격이 저장돼 보인다");
        assertEquals(1L, inTx.getHeader().getAuditVer());
        assertEquals(before, snapshot(ID), "바깥 롤백 뒤에는 VER 행·선분·부모가 그대로다");

        String fresh = "NEW_CD";
        seeds.seedCode(fresh, "CREATED", "MDM");
        Snapshot freshBefore = snapshot(fresh);
        CodeEditView first = tx.execute(s -> {
            CodeEditView v = service.createVersion(createReq(fresh, "MAJOR"));
            s.setRollbackOnly();
            return v;
        });
        assertEquals("1.000", first.getVersions().get(0).getVer());
        assertEquals(freshBefore, snapshot(fresh), "바깥 롤백 뒤에는 VER 1.000 도 BASE 도 없다");
        assertEquals(0, seeds.count("TB_MDM_CODE_CATE", fresh));
    }

    @Test
    void O2_바깥_트랜잭션이_롤백되면_성공한_복원과_승격도_사라진다() {
        twoReleases();
        Snapshot before = snapshot(ID);

        CodeEditView inTx = tx.execute(s -> {
            CodeEditView v = service.restoreVersion(restoreReq(ID, "MAJOR", "1.000"));
            s.setRollbackOnly();
            return v;
        });

        CodeVersionRow top = inTx.getVersions().get(0);
        assertEquals("2.000", top.getVer());
        assertEquals("1.000", top.getRestoredFrom());
        assertEquals("INUSE", inTx.getHeader().getStoredStatus());
        assertEquals(before, snapshot(ID), "바깥 롤백 뒤에는 VER 행·복원 선분·부모가 그대로다");
    }

    // ── S: 성공하면 이 행들이 생긴다 ──

    @Test
    void S1_첫_새_버전은_1_000_DRAFT_와_BASE_한_행을_쓰고_부모는_건드리지_않는다() {
        seeds.seedCode(ID, "CREATED", "MDM");
        as("stw2");

        CodeEditView v = create(ID, "MAJOR");

        assertEquals(List.of("1.000|MAJOR|DRAFT|stw2|null|0|0|null|null|null"), vers(ID));
        assertEquals(List.of("CATE|BASE|1.000|9999.000|전체"), spans(ID));
        assertEquals("REGEX|.*|CODE", jdbc.queryForObject("SELECT DEF_KIND || '|' || DEF_EXPR || '|' || DEF_TARGET"
                + " FROM TB_MDM_CODE_CATE WHERE MARU_CODE_ID = ?", String.class, ID));
        assertEquals("CREATED|0|null", parent(ID), "적용된 RELEASED 가 없으면 부모 행을 고치지 않는다");
        assertEquals("CREATED", v.getHeader().getStoredStatus());
        assertEquals("stw2", v.getVersions().get(0).getOwnerId());
    }

    @Test
    void S2_적용된_RELEASED_가_있으면_새_버전은_VER_행만_쓰고_부모를_엔티티_경로로_INUSE_로_올린다() {
        createdWithApplied();
        List<String> segmentsBefore = seeds.segments(ID);
        as("stw2");

        CodeEditView v = create(ID, "MINOR");

        assertEquals(List.of("1.000|MAJOR|RELEASED|stw1|null|0|0|set|set|set",
                "1.001|MINOR|DRAFT|stw2|null|0|0|null|null|null"), vers(ID));
        assertEquals(segmentsBefore, seeds.segments(ID), "1.000 이 아니면 BASE 도 선분도 쓰지 않는다");
        assertEquals("INUSE|1|set", parent(ID), "CREATED→INUSE 는 엔티티 UPDATE 라 감사 카운터가 1 오르고 U_AT 가 찬다");
        assertEquals("INUSE", v.getHeader().getStoredStatus());
        assertEquals(1L, v.getHeader().getAuditVer());

        String inUse = "IN_CD";
        seeds.seedCode(inUse, "INUSE", "MDM");
        seeds.released(inUse, "1.000", PAST, OPEN_END);
        create(inUse, "MAJOR");
        assertEquals(List.of("1.000|MAJOR|RELEASED|stw1|null|0|0|set|set|set",
                "2.000|MAJOR|DRAFT|stw2|null|0|0|null|null|null"), vers(inUse));
        assertEquals(0, seeds.count("TB_MDM_CODE_CATE", inUse), "2.000 에는 BASE 를 만들지 않는다");
        assertEquals("INUSE|0|null", parent(inUse), "이미 INUSE 면 부모 행을 고치지 않는다");
    }

    @Test
    void S3_복원은_원본_모습으로_선분을_닫고_복사하며_부모를_INUSE_로_올린다() {
        twoReleases();
        as("stw2");

        CodeEditView v = restore("MAJOR", "1.000");

        assertEquals(List.of("1.000|MAJOR|RELEASED|stw1|null|0|0|set|set|set",
                "1.001|MINOR|RELEASED|stw1|null|0|0|set|set|set",
                "2.000|MAJOR|DRAFT|stw2|1.000|0|0|null|null|null"), vers(ID));
        assertEquals(sorted(
                "ITEM|A|1.000|1.001|a1",
                "ITEM|A|1.001|2.000|a2",        // 닫힘(값이 다름)
                "ITEM|A|2.000|9999.000|a1",     // 복사
                "ITEM|B|1.000|1.001|b1",
                "ITEM|B|2.000|9999.000|b1",     // 복사(원본에만 있음)
                "ITEM|C|1.001|2.000|c1",        // 닫힘(현재에만 있음)
                "ITEM|D|1.000|9999.000|d1",     // 같은 값 — 그대로
                "CATE|BASE|1.000|9999.000|전체", // BASE 는 건드리지 않는다
                "CATE|T|1.000|1.001|t1",
                "CATE|T|1.001|2.000|t2",        // 닫힘
                "CATE|T|2.000|9999.000|t1",     // 복사
                "CATE_ITEM|T,A|1.000|1.001",
                "CATE_ITEM|T,A|2.000|9999.000", // 복사
                "CATE_ITEM|T,C|1.001|2.000",    // 닫힘
                "CATE_ITEM|T,D|1.000|9999.000"), spans(ID));
        assertEquals("INUSE|1|set", parent(ID));
        CodeVersionRow top = v.getVersions().get(0);
        assertEquals("2.000", top.getVer());
        assertEquals("v1.000 복원", top.getRestoredLabel());
        assertEquals("INUSE", v.getHeader().getStoredStatus());
    }

    // ── 도우미 ──

    private void as(String userId) {
        currentUser.set(userId, Set.of("MDM_STEWARD"));
    }

    private CodeEditView create(String id, String kind) {
        return tx.execute(s -> service.createVersion(createReq(id, kind)));
    }

    private CodeEditView restore(String kind, String source) {
        return tx.execute(s -> service.restoreVersion(restoreReq(ID, kind, source)));
    }

    private static CodeVersionCreateRequest createReq(String id, String kind) {
        CodeVersionCreateRequest r = new CodeVersionCreateRequest();
        r.setMaruCodeId(id);
        r.setVerKind(kind);
        return r;
    }

    private static CodeVersionRestoreRequest restoreReq(String id, String kind, String source) {
        CodeVersionRestoreRequest r = new CodeVersionRestoreRequest();
        r.setMaruCodeId(id);
        r.setVerKind(kind);
        r.setSourceVer(source);
        return r;
    }

    private Snapshot snapshot(String id) {
        return new Snapshot(vers(id), seeds.segments(id), parent(id));
    }

    /** VER 행: ver|kind|status|owner|restoredFrom|rowVersion|audVer|applyFrom|applyTo|releasedAt(일시는 null/set). */
    private List<String> vers(String id) {
        return jdbc.query("SELECT CAST(VER AS VARCHAR(40)) V, VER_KIND, STATUS, OWNER_ID, CAST(RESTORED_FROM AS VARCHAR(40)) R,"
                        + " ROW_VERSION, AUD_VER, APPLY_FROM, APPLY_TO, RELEASED_AT FROM TB_MDM_CODE_VER"
                        + " WHERE MARU_CODE_ID = ? ORDER BY VER",
                (rs, i) -> ver(rs.getString("V")) + "|" + rs.getString("VER_KIND") + "|" + rs.getString("STATUS") + "|"
                        + rs.getString("OWNER_ID") + "|" + ver(rs.getString("R")) + "|" + rs.getString("ROW_VERSION") + "|"
                        + rs.getString("AUD_VER") + "|" + set(rs.getObject("APPLY_FROM")) + "|" + set(rs.getObject("APPLY_TO"))
                        + "|" + set(rs.getObject("RELEASED_AT")),
                id);
    }

    /** 부모 행: STATUS|감사 카운터(VER)|U_AT(null/set). */
    private String parent(String id) {
        return jdbc.queryForObject("SELECT STATUS, VER, U_AT FROM TB_MDM_CODE WHERE MARU_CODE_ID = ?",
                (rs, i) -> rs.getString("STATUS") + "|" + rs.getString("VER") + "|" + set(rs.getObject("U_AT")), id);
    }

    /** 세 선분 표의 키·구간·이름(정렬). 버전 번호는 scale 3 문자열로 맞춘다. */
    private List<String> spans(String id) {
        List<String> out = new ArrayList<>();
        jdbc.query("SELECT CODE, CAST(FROM_VER AS VARCHAR(40)) F, CAST(TO_VER AS VARCHAR(40)) T, NAME FROM TB_MDM_CODE_ITEM"
                        + " WHERE MARU_CODE_ID = ?",
                rs -> {
                    out.add("ITEM|" + rs.getString("CODE") + "|" + ver(rs.getString("F")) + "|" + ver(rs.getString("T")) + "|"
                            + rs.getString("NAME"));
                }, id);
        jdbc.query("SELECT CATE_ID, CAST(FROM_VER AS VARCHAR(40)) F, CAST(TO_VER AS VARCHAR(40)) T, CATE_NAME"
                        + " FROM TB_MDM_CODE_CATE WHERE MARU_CODE_ID = ?",
                rs -> {
                    out.add("CATE|" + rs.getString("CATE_ID") + "|" + ver(rs.getString("F")) + "|" + ver(rs.getString("T"))
                            + "|" + rs.getString("CATE_NAME"));
                }, id);
        jdbc.query("SELECT CATE_ID, CODE, CAST(FROM_VER AS VARCHAR(40)) F, CAST(TO_VER AS VARCHAR(40)) T"
                        + " FROM TB_MDM_CODE_CATE_ITEM WHERE MARU_CODE_ID = ?",
                rs -> {
                    out.add("CATE_ITEM|" + rs.getString("CATE_ID") + "," + rs.getString("CODE") + "|" + ver(rs.getString("F"))
                            + "|" + ver(rs.getString("T")));
                }, id);
        out.sort(null);
        return out;
    }

    private static List<String> sorted(String... rows) {
        List<String> out = new ArrayList<>(Arrays.asList(rows));
        out.sort(null);
        return out;
    }

    private static String ver(String s) {
        return s == null ? null : new BigDecimal(s).setScale(3).toPlainString();
    }

    private static String set(Object value) {
        return value == null ? "null" : "set";
    }

    /** 부모 CREATED→INUSE UPDATE 에서만 실패한다(엔티티 UPDATE 도 네이티브 UPDATE 도 STATUS 를 쓴다). */
    private static String promotionTrigger() {
        return "BEFORE UPDATE OF STATUS ON TB_MDM_CODE FOR EACH ROW WHEN (OLD.STATUS = 'CREATED' AND NEW.STATUS = 'INUSE') ";
    }

    /** DDL 은 암묵 커밋이라 트랜잭션 밖에서 만든다. 지우기는 {@link #tearDown}. */
    private void createTrigger(String timingAndTable) {
        jdbc.execute("CREATE OR REPLACE TRIGGER " + TRIGGER + " " + timingAndTable + FAIL_BODY);
    }

    /** Oracle 23 미만에는 DROP TRIGGER IF EXISTS 가 없다 — 없는 트리거(ORA-04080)는 넘긴다. */
    private void dropTrigger() {
        jdbc.execute("BEGIN EXECUTE IMMEDIATE 'DROP TRIGGER " + TRIGGER + "'; "
                + "EXCEPTION WHEN OTHERS THEN IF SQLCODE != -4080 THEN RAISE; END IF; END;");
    }

    /** 원인 사슬의 문구를 모두 잇는다 — 트리거 문구(ORA-20001)는 안쪽 SQLException 에 있다. */
    private static String messages(Throwable e) {
        StringBuilder sb = new StringBuilder();
        for (Throwable t = e; t != null; t = t.getCause() == t ? null : t.getCause()) {
            sb.append(t.getMessage()).append(" | ");
        }
        return sb.toString();
    }
}
