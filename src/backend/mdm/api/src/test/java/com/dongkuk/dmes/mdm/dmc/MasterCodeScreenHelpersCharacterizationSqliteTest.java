package com.dongkuk.dmes.mdm.dmc;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN_END;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.assertj.core.api.Assertions.entry;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCatePreviewRequest;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCateRevertRequest;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCateSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCateViewRequest;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.service.CodeCateEditService;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemPatchRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemPreviewRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemRevertRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemViewRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.service.CodeItemEditService;
import java.sql.Timestamp;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * C6(BE 리팩토링 2회차) 특성 시험이다. 두 서비스의 사본 도우미를 공용 클래스로 옮기기 전에 그 동작을 공개 서비스 응답으로 고정한다.
 *
 * <p>대상은 {@code CodeCateEditService}·{@code CodeItemEditService} 의 header·requireVersionExists·version·defaultVersion·
 * isUnapplied·headerMap·versionMap·issueMap·parseVer·str·display·text·isBlank 다. 옮긴 뒤에도 오류 문구·오류 코드·
 * 응답 칸 순서·값이 같아야 한다.
 *
 * <p>DB 는 공유 시험 DB 다({@link AbstractMdmSharedDbTest}). 이름에 Sqlite 가 있지만 실제로는 Oracle 시험 PDB 다. 그래서
 * {@code VER NUMBER(7,3)} 은 {@code 1.000} 을 {@code 1} 로 돌려준다. 응답의 {@code "1.000"} 은 서비스가 세 자리로 맞춘 값이다.
 * Oracle 은 빈 문자열을 NULL 로 저장한다. 빈 문자열과 null 의 차이는 응답(메모리 엔티티)으로만 본다.
 *
 * <p>기본 시드 {@code M}(lvl_cnt 2): 1.000 RELEASED(행 A·B·C), 1.001 DRAFT(소유자 kim, row_version 3), BASE 카테고리.
 * 시계는 {@link MasterCodeTestConfig#SAMPLE_DAY}(2026-09-03 00:00:00)다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class MasterCodeScreenHelpersCharacterizationSqliteTest extends AbstractMdmSharedDbTest {

    private static final long RV = 3L;
    private static final String INVALID_PREFIX = MdmErrorCode.INVALID_INPUT.defaultMessage() + ": ";

    @Autowired
    CodeCateEditService cate;
    @Autowired
    CodeItemEditService item;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    MutableClock clock;
    @Autowired
    DataSource dataSource;

    private MasterCodeFixtures fx;
    private JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        fx = new MasterCodeFixtures(jdbc);
        fx.clear();
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
    }

    @AfterEach
    void resetClock() {
        clock.setLocal(MasterCodeTestConfig.SAMPLE_DAY);
    }

    private void seedM() {
        fx.seedCode("M", "시험 코드", "MDM", 2, "라벨1");
        fx.seedVersion("M", "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", OPEN_END, 0);
        fx.seedVersion("M", "1.001", "DRAFT", "kim", null, null, RV);
        fx.seedItem("M", "A", "1.000", OPEN, "에이", null, 1, "a1", "G");
        fx.seedItem("M", "B", "1.000", OPEN, "비", null, 2, null, "G");
        fx.seedItem("M", "C", "1.000", OPEN, "씨", null, 3, null, "H");
        fx.seedCate("M", "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");
    }

    // ── 오류 문구: header·parseVer·version ─────────────────────────────────

    @Test
    void maruCodeId_가_null_빈칸_공백이면_두_서비스_모든_진입점이_MDM021_maruCodeId_가_필요합니다() {
        seedM();
        for (String blank : Arrays.asList(null, "", "  ")) {
            entryPoints(blank, "1.001").forEach((name, call) ->
                    assertInvalid(name + " id=[" + blank + "]", "maruCodeId 가 필요합니다", call));
        }
    }

    @Test
    void 없는_마루_코드면_두_서비스_모든_진입점이_MDM021_마루_코드가_없습니다() {
        seedM();
        entryPoints("NOPE", "1.001").forEach((name, call) ->
                assertInvalid(name, "마루 코드가 없습니다: NOPE", call));
    }

    @Test
    void ver_가_필요한_진입점은_null_빈칸_공백이면_MDM021_ver_가_필요합니다_view_는_기본_버전을_고른다() {
        seedM();
        for (String blank : Arrays.asList(null, "", "  ")) {
            entryPoints("M", blank).forEach((name, call) -> {
                if (name.endsWith(".view")) {
                    return;
                }
                assertInvalid(name + " ver=[" + blank + "]", "ver 가 필요합니다", call);
            });
            assertThat(map(cate.view(cateView("M", blank)), "selected").get("ver")).isEqualTo("1.001");
            assertThat(map(item.view(itemView("M", blank)), "selected").get("ver")).isEqualTo("1.001");
        }
    }

    @Test
    void 형식이_틀린_ver_는_모든_진입점이_MDM021_버전_형식_문구다() {
        seedM();
        entryPoints("M", "abc").forEach((name, call) ->
                assertInvalid(name, "버전 형식이 올바르지 않습니다: abc", call));
    }

    @Test
    void 없는_버전은_읽기_검사_진입점이_MDM021_버전이_없습니다_세_자리() {
        seedM();
        for (String[] c : new String[][] {{"9", "9.000"}, {"9.5", "9.500"}}) {
            String detail = "버전이 없습니다: " + c[1];
            Map<String, ThrowingCallable> calls = entryPoints("M", c[0]);
            for (String name : List.of("cate.view", "cate.preview", "cate.validate", "item.view", "item.preview",
                    "item.validate")) {
                assertInvalid(name + " ver=" + c[0], detail, calls.get(name));
            }
        }
        // 경미 수정은 행 찾기가 먼저라 버전 문자열이 행 문구에 실린다.
        assertInvalid("item.patch fromVer=9", "경미 수정할 행이 없습니다: A@9.000",
                () -> item.patch(itemPatch("M", "A", "9", "x", null, 1, null)));
    }

    // ── requireVersionExists ───────────────────────────────────────────

    @Test
    void 없는_버전에_쓰면_save_revert_는_다른_검사보다_먼저_MDM001_이고_아무것도_바꾸지_않는다() {
        seedM();
        Map<String, ThrowingCallable> calls = entryPoints("M", "9");
        for (String name : List.of("cate.save", "cate.revert", "item.save", "item.revert")) {
            assertRowVersionConflict(name, calls.get(name));
        }
        // 빈 그리드·rowVersion 없음·table 없음 검사보다 앞선다.
        assertRowVersionConflict("cate.save 빈 요청",
                () -> cate.save(cateSave("M", "9.000", null), null, null));
        assertRowVersionConflict("cate.revert 빈 요청",
                () -> cate.revert(cateRevert("M", "9.000", null, null, null, null)));
        assertRowVersionConflict("item.save 빈 요청",
                () -> item.save(itemSave("M", "9.000", null), null, null, null));
        assertRowVersionConflict("item.revert 빈 요청",
                () -> item.revert(itemRevert("M", "9.000", null, null)));

        assertThat(fx.rowVersion("M", "1.001")).isEqualTo(RV);
        assertThat(fx.itemSegments("M")).containsExactly("A@1.000-9999", "B@1.000-9999", "C@1.000-9999");
        assertThat(fx.cateSegments("M")).containsExactly("BASE@1.000-9999");
    }

    // ── view: str·display·same·versionMap·headerMap ──────────────────────

    @Test
    void view_는_정수_ver_요청도_같은_버전으로_고르고_세_자리_문자열로_돌려준다() {
        seedM();
        for (Map<String, Object> r : List.of(cate.view(cateView("M", "1")), item.view(itemView("M", "1")))) {
            Map<String, Object> selected = map(r, "selected");
            assertThat(selected.get("ver")).isEqualTo("1.000");
            assertThat(selected.get("display")).isEqualTo("v1.000");
            assertThat(selected.get("status")).isEqualTo("RELEASED");
        }
    }

    @Test
    void view_버전_목록_칸은_7개_순서_고정이고_ver_는_세_자리_일시는_초까지다() {
        fx.seedCode("V", "버전 코드", "MDM", 1);
        fx.seedVersion("V", "1.000", "RELEASED", "kim", "2026-01-01 09:30:15", OPEN_END, 0);
        fx.seedVersion("V", "1.010", "CANCELLED", "lee", "2026-02-03 04:05:06", "2026-03-04 05:06:07", 0);
        fx.seedVersion("V", "2.000", "DRAFT", "kim", null, null, 0);

        for (Map<String, Object> r : List.of(cate.view(cateView("V", null)), item.view(itemView("V", null)))) {
            List<Map<String, Object>> versions = list(r, "versions");
            assertThat(versions).hasSize(3);
            assertThat(versions.get(0)).containsExactly(entry("ver", "2.000"), entry("display", "v2.000"),
                    entry("status", "DRAFT"), entry("verKind", "MAJOR"), entry("ownerId", "kim"),
                    entry("applyFrom", null), entry("applyTo", null));
            assertThat(versions.get(1)).containsExactly(entry("ver", "1.010"), entry("display", "v1.010"),
                    entry("status", "CANCELLED"), entry("verKind", "MINOR"), entry("ownerId", "lee"),
                    entry("applyFrom", "2026-02-03 04:05:06"), entry("applyTo", "2026-03-04 05:06:07"));
            assertThat(versions.get(2)).containsExactly(entry("ver", "1.000"), entry("display", "v1.000"),
                    entry("status", "RELEASED"), entry("verKind", "MAJOR"), entry("ownerId", "kim"),
                    entry("applyFrom", "2026-01-01 09:30:15"), entry("applyTo", "9999-12-31 00:00:00"));
        }
    }

    @Test
    void view_헤더는_카테고리_편집_5칸_코드_편집_5칸_뒤_attrLabels_이고_빈_라벨은_뺀다() {
        fx.seedCode("L", "라벨 코드", "MDM", 2, "라벨1", "  ", null, "라벨4");

        Map<String, Object> cateHeader = map(cate.view(cateView("L", null)), "header");
        assertThat(cateHeader).containsExactly(entry("maruCodeId", "L"), entry("maruCodeName", "라벨 코드"),
                entry("sourceKind", "MDM"), entry("status", "INUSE"), entry("lvlCnt", 2));

        Map<String, Object> itemHeader = map(item.view(itemView("L", null)), "header");
        assertThat(itemHeader.keySet()).containsExactly("maruCodeId", "maruCodeName", "sourceKind", "status", "lvlCnt",
                "attrLabels");
        assertThat(itemHeader).containsEntry("maruCodeId", "L").containsEntry("maruCodeName", "라벨 코드")
                .containsEntry("sourceKind", "MDM").containsEntry("status", "INUSE").containsEntry("lvlCnt", 2);
        List<Map<String, Object>> labels = list(itemHeader, "attrLabels");
        assertThat(labels).containsExactly(Map.of("no", 1, "label", "라벨1"), Map.of("no", 4, "label", "라벨4"));
        labels.forEach(l -> assertThat(l.keySet()).containsExactlyInAnyOrder("no", "label"));
    }

    // ── defaultVersion ────────────────────────────────────────────────

    @Test
    void 기본_버전은_DRAFT_가_있으면_더_큰_RELEASED_보다_DRAFT_다() {
        seedM();
        fx.seedVersion("M", "1.002", "RELEASED", "kim", "2026-12-01 00:00:00", OPEN_END, 0);

        assertThat(map(cate.view(cateView("M", null)), "selected").get("ver")).isEqualTo("1.001");
        assertThat(map(item.view(itemView("M", null)), "selected").get("ver")).isEqualTo("1.001");
    }

    @Test
    void 기본_버전은_DRAFT_가_없으면_CANCELLED_를_건너뛴_가장_큰_버전이다() {
        fx.seedCode("N", "초안 없음", "MDM", 0);
        fx.seedVersion("N", "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", OPEN_END, 0);
        fx.seedVersion("N", "1.001", "RELEASED", "kim", "2026-02-01 00:00:00", OPEN_END, 0);
        fx.seedVersion("N", "2.000", "CANCELLED", "kim", "2026-08-01 00:00:00", "2026-09-01 00:00:00", 0);

        for (Map<String, Object> r : List.of(cate.view(cateView("N", null)), item.view(itemView("N", null)))) {
            assertThat(list(r, "versions")).extracting(v -> v.get("ver")).containsExactly("2.000", "1.001", "1.000");
            assertThat(map(r, "selected").get("ver")).isEqualTo("1.001");
        }
    }

    @Test
    void 기본_버전은_CANCELLED_만_있으면_없고_selected_가_null() {
        fx.seedCode("X", "취소만", "MDM", 0);
        fx.seedVersion("X", "1.000", "CANCELLED", "kim", "2026-08-01 00:00:00", "2026-09-01 00:00:00", 0);

        Map<String, Object> c = cate.view(cateView("X", null));
        assertThat(c).containsEntry("selected", null);
        assertThat(list(c, "versions")).hasSize(1);
        Map<String, Object> i = item.view(itemView("X", null));
        assertThat(i).containsEntry("selected", null);
        assertThat(list(i, "versions")).hasSize(1);
    }

    // ── isUnapplied ───────────────────────────────────────────────────

    @Test
    void 미적용은_적용_시작이_지금과_같으면_아니고_초_단위로_자른_지금보다_뒤면_맞다() {
        seedM();
        fx.seedVersion("M", "1.002", "RELEASED", "kim", "2026-09-03 00:00:00", OPEN_END, 0);

        // 경계: 적용 시작 = 지금 → 적용됨. 미적용은 DRAFT 하나뿐이다.
        assertSelectedWarning(null, true);

        // 지금 00:00:00.5 를 00:00:00 으로 자른다. 적용 시작 00:00:00.3 은 그보다 뒤라 미적용이 둘이 된다.
        clock.setLocal(MasterCodeTestConfig.SAMPLE_DAY.plusNanos(500_000_000));
        jdbc.update("UPDATE TB_MDM_CODE_VER SET APPLY_FROM = ? WHERE MARU_CODE_ID = 'M' AND VER = 1.002",
                Timestamp.valueOf("2026-09-03 00:00:00.3"));
        assertSelectedWarning("MULTIPLE_UNAPPLIED", false);
        // 목록의 일시는 초까지만 찍는다.
        assertThat(list(cate.view(cateView("M", "1.001")), "versions").get(0).get("applyFrom"))
                .isEqualTo("2026-09-03 00:00:00");

        // 대조: 서비스가 바뀐 시계를 본다. 지금 00:00:01 이면 적용 시작 00:00:00.5 는 적용됨이다.
        clock.setLocal(MasterCodeTestConfig.SAMPLE_DAY.plusSeconds(1));
        jdbc.update("UPDATE TB_MDM_CODE_VER SET APPLY_FROM = ? WHERE MARU_CODE_ID = 'M' AND VER = 1.002",
                Timestamp.valueOf("2026-09-03 00:00:00.5"));
        assertSelectedWarning(null, true);
    }

    private void assertSelectedWarning(String warning, boolean editable) {
        for (Map<String, Object> r : List.of(cate.view(cateView("M", "1.001")), item.view(itemView("M", "1.001")))) {
            Map<String, Object> selected = map(r, "selected");
            assertThat(selected).containsEntry("warning", warning).containsEntry("editable", editable);
        }
    }

    // ── issueMap ──────────────────────────────────────────────────────

    @Test
    void 검사_이슈는_code_message_field_itemKey_네_칸_순서이고_null_칸도_남는다() {
        seedM();
        Map<String, Object> cateResult = cate.validate(cateSave("M", "1.001", null),
                List.of(cateRow("ADDED", "R1", "정규식", "REGEX", "(", "CODE")), List.of());
        assertThat(list(cateResult, "issues")).singleElement().satisfies(i -> assertThat(i).containsExactly(
                entry("code", "INVALID_REGEX"), entry("message", "정규식 문법이 올바르지 않다: ("),
                entry("field", "defExpr"), entry("itemKey", "R1")));

        Map<String, Object> itemResult = item.validate(itemSave("M", "1.001", null),
                List.of(itemRow("ADDED", "A B", "x", 9, "G")),
                List.of(cateRow("CHANGED", "BASE", "전체 바꿈", "REGEX", ".*", "CODE")), List.of());
        assertThat(list(itemResult, "issues")).singleElement().satisfies(i -> {
            assertThat(i.keySet()).containsExactly("code", "message", "field", "itemKey");
            assertThat(i).containsEntry("code", "CODE_FORBIDDEN_CHAR").containsEntry("field", "code")
                    .containsEntry("itemKey", "A B");
        });
        assertThat(list(itemResult, "cateIssues")).singleElement().satisfies(i -> assertThat(i).containsExactly(
                entry("code", "RESERVED_CATEGORY"), entry("message", "BASE 는 예약 카테고리라 바꿀 수 없다"),
                entry("field", null), entry("itemKey", "BASE")));

        fx.seedEqpCd();
        Map<String, Object> external = item.validate(itemSave("EQP_CD", "2.000", null), List.of(), List.of(), List.of());
        assertThat(list(external, "issues")).singleElement().satisfies(i -> assertThat(i).containsExactly(
                entry("code", "SOURCE_EXTERNAL"), entry("message", "원천이 EXTERNAL 인 마루 코드는 MDM 화면에서 저장하지 않는다"),
                entry("field", null), entry("itemKey", "EQP_CD")));
        assertThat(list(external, "cateIssues")).isEmpty();
    }

    // ── text ──────────────────────────────────────────────────────────

    @Test
    void 카테고리_미리보기_cateId_는_빈_문자열만_null_이고_공백은_그대로다() {
        seedM();
        assertThat(cate.preview(catePreview("M", "1.001", null, "[AB]", "CODE"))).containsEntry("cateId", null);
        assertThat(cate.preview(catePreview("M", "1.001", "", "[AB]", "CODE"))).containsEntry("cateId", null);
        assertThat(cate.preview(catePreview("M", "1.001", "  ", "[AB]", "CODE"))).containsEntry("cateId", "  ");
        assertThat(cate.preview(catePreview("M", "1.001", "R9", "[AB]", "CODE"))).containsEntry("cateId", "R9");
    }

    @Test
    void 경미_수정_이름_약칭_설명은_빈_문자열만_null_이고_공백은_그대로_쓴다() {
        seedM();

        Map<String, Object> r = item.patch(itemPatch("M", "A", "1.000", "고친 에이", "", 11, "  "));

        Map<String, Object> row = map(r, "row");
        assertThat(row).containsEntry("name", "고친 에이").containsEntry("alterName", null)
                .containsEntry("description", "  ").containsEntry("seq", 11);
        assertThat(jdbc.queryForObject("SELECT DESCRIPTION FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'M' AND CODE = 'A'",
                String.class)).isEqualTo("  ");

        Map<String, Object> again = map(item.patch(itemPatch("M", "A", "1.000", "", "  ", 12, "")), "row");
        assertThat(again).containsEntry("name", null).containsEntry("alterName", "  ")
                .containsEntry("description", null);
    }

    // ── helpers ───────────────────────────────────────────────────────

    /** 두 서비스의 공개 진입점 11개(이름 → 호출). id·ver 만 바꿔 같은 도우미 경로를 지나게 한다. */
    private Map<String, ThrowingCallable> entryPoints(String id, String ver) {
        Map<String, ThrowingCallable> m = new LinkedHashMap<>();
        m.put("cate.view", () -> cate.view(cateView(id, ver)));
        m.put("cate.preview", () -> cate.preview(catePreview(id, ver, "X", "[AB]", "CODE")));
        m.put("cate.validate", () -> cate.validate(cateSave(id, ver, null), List.of(), List.of()));
        m.put("cate.save", () -> cate.save(cateSave(id, ver, RV), List.of(), List.of()));
        m.put("cate.revert", () -> cate.revert(cateRevert(id, ver, RV, "CATE", "T1", null)));
        m.put("item.view", () -> item.view(itemView(id, ver)));
        m.put("item.preview", () -> item.preview(itemPreview(id, ver, "BASE")));
        m.put("item.validate", () -> item.validate(itemSave(id, ver, null), List.of(), List.of(), List.of()));
        m.put("item.save", () -> item.save(itemSave(id, ver, RV), List.of(), List.of(), List.of()));
        m.put("item.revert", () -> item.revert(itemRevert(id, ver, RV, "A")));
        // 경미 수정은 ver 를 fromVer 칸으로 받는다(문구는 같다).
        m.put("item.patch", () -> item.patch(itemPatch(id, "A", ver, "x", null, 1, null)));
        return m;
    }

    /** MDM021(INVALID_INPUT) — message 는 기본 문구 + ": " + detail, 상세는 MDM021 한 건. */
    private static void assertInvalid(String label, String detail, ThrowingCallable call) {
        BusinessException e = mdm(label, call);
        assertThat(e).as(label).hasMessage(INVALID_PREFIX + detail);
        assertThat(e.getErrorCode()).as(label).isEqualTo(ErrorCode.INVALID_VALUE);
        assertThat(((ResponseCodeAware) e).responseCode()).as(label).isEqualTo("MDM021");
        assertThat(e.getErrors()).as(label).extracting(ErrorDetail::code).containsExactly("MDM021");
    }

    /** MDM001(ROW_VERSION_CONFLICT) — message 는 기본 문구만. */
    private static void assertRowVersionConflict(String label, ThrowingCallable call) {
        BusinessException e = mdm(label, call);
        assertThat(e).as(label).hasMessage(MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage());
        assertThat(e.getErrorCode()).as(label).isEqualTo(ErrorCode.BUSINESS_ERROR);
        assertThat(((ResponseCodeAware) e).responseCode()).as(label).isEqualTo("MDM001");
        assertThat(e.getErrors()).as(label).extracting(ErrorDetail::code).containsExactly("MDM001");
    }

    private static BusinessException mdm(String label, ThrowingCallable call) {
        Throwable t = catchThrowable(call);
        assertThat(t).as(label).isInstanceOf(BusinessException.class).isInstanceOf(ResponseCodeAware.class);
        return (BusinessException) t;
    }

    private static CodeCateViewRequest cateView(String id, String ver) {
        CodeCateViewRequest r = new CodeCateViewRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        return r;
    }

    private static CodeCatePreviewRequest catePreview(String id, String ver, String cateId, String defExpr,
                                                      String defTarget) {
        CodeCatePreviewRequest r = new CodeCatePreviewRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setCateId(cateId);
        r.setDefExpr(defExpr);
        r.setDefTarget(defTarget);
        return r;
    }

    private static CodeCateSaveRequest cateSave(String id, String ver, Long rowVersion) {
        CodeCateSaveRequest r = new CodeCateSaveRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion);
        return r;
    }

    private static CodeCateRevertRequest cateRevert(String id, String ver, Long rowVersion, String table, String cateId,
                                                    String code) {
        CodeCateRevertRequest r = new CodeCateRevertRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion);
        r.setTable(table);
        r.setCateId(cateId);
        r.setCode(code);
        return r;
    }

    private static CodeItemViewRequest itemView(String id, String ver) {
        CodeItemViewRequest r = new CodeItemViewRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        return r;
    }

    private static CodeItemPreviewRequest itemPreview(String id, String ver, String cateId) {
        CodeItemPreviewRequest r = new CodeItemPreviewRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setCateId(cateId);
        return r;
    }

    private static CodeItemSaveRequest itemSave(String id, String ver, Long rowVersion) {
        CodeItemSaveRequest r = new CodeItemSaveRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion);
        return r;
    }

    private static CodeItemRevertRequest itemRevert(String id, String ver, Long rowVersion, String code) {
        CodeItemRevertRequest r = new CodeItemRevertRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion);
        r.setCode(code);
        return r;
    }

    private static CodeItemPatchRequest itemPatch(String id, String code, String fromVer, String name, String alterName,
                                                  Integer seq, String description) {
        CodeItemPatchRequest r = new CodeItemPatchRequest();
        r.setMaruCodeId(id);
        r.setCode(code);
        r.setFromVer(fromVer);
        r.setName(name);
        r.setAlterName(alterName);
        r.setSeq(seq);
        r.setDescription(description);
        return r;
    }

    /** categories 그리드 행 — 모양은 두 서비스가 같다. */
    private static Map<String, Object> cateRow(String status, String cateId, String cateName, String defKind,
                                               String defExpr, String defTarget) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", status);
        m.put("cateId", cateId);
        m.put("cateName", cateName);
        m.put("defKind", defKind);
        m.put("defExpr", defExpr);
        m.put("defTarget", defTarget);
        return m;
    }

    /** 코드 편집 rows 그리드 행 — lvls 는 lvl1 부터. */
    private static Map<String, Object> itemRow(String status, String code, String name, Integer seq, String... lvls) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", status);
        m.put("code", code);
        m.put("name", name);
        m.put("seq", seq);
        for (int i = 0; i < lvls.length; i++) {
            m.put("lvl" + (i + 1), lvls[i]);
        }
        return m;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> result, String key) {
        return (List<Map<String, Object>>) result.get(key);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Map<String, Object> result, String key) {
        return (Map<String, Object>) result.get(key);
    }
}
