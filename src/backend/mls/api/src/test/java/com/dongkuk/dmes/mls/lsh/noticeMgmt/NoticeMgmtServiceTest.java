package com.dongkuk.dmes.mls.lsh.noticeMgmt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mls.entity.Notice;
import com.dongkuk.dmes.mls.lsh.noticeMgmt.dto.NoticeMgmtSearchRequest;
import com.dongkuk.dmes.mls.lsh.noticeMgmt.service.NoticeMgmtService;
import com.dongkuk.dmes.mls.repository.NoticeRepository;
import com.dongkuk.dmes.mls.repository.NoticeTargetRepository;
import com.dongkuk.dmes.mls.testdb.MlsTestDb;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

/**
 * noticeMgmt V3 확장 — 본문 형식(CONTENT_FORMAT)·공지 분류(NOTICE_CATEGORY)·상단 고정(PIN_YN), HTML 소독, 4000자 제한 해제.
 * 실제 SQLite 파일에 Flyway V1~V3 를 적용한 컨텍스트에서 서비스를 직접 부른다. 각 시험은 트랜잭션 롤백으로 격리한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Transactional
class NoticeMgmtServiceTest extends MlsTestDb {

    @Autowired
    NoticeMgmtService service;
    @Autowired
    NoticeRepository repository;
    @Autowired
    EntityManager em;
    @Autowired
    NoticeTargetRepository targetRepository;

    private static final String START = LocalDate.now().minusDays(1).toString();
    private static final String END = LocalDate.now().plusDays(30).toString();

    private static Map<String, Object> newRow(String title) {
        Map<String, Object> row = new HashMap<>();
        row.put("rowStatus", "C");
        row.put("TITLE", title);
        row.put("CONTENT", "본문");
        row.put("NOTICE_STATUS", "DRAFT");
        return row;
    }

    /** 저장 뒤 영속성 컨텍스트를 비워 DB 에서 다시 읽는다 — 메모리 값이 아니라 실제 저장값을 단언하려는 것이다. */
    private Notice create(Map<String, Object> row) {
        service.save(List.of(row));
        em.flush();
        em.clear();
        return repository.findAll().stream()
                .filter(n -> row.get("TITLE").equals(n.getTitle()))
                .findFirst().orElseThrow();
    }

    private static Map<String, Object> updateRow(Notice n) {
        Map<String, Object> row = new HashMap<>();
        row.put("rowStatus", "U");
        row.put("NOTICE_ID", n.getNoticeId());
        row.put("TITLE", n.getTitle());
        row.put("CONTENT", n.getContent());
        row.put("NOTICE_STATUS", n.getNoticeStatus());
        return row;
    }

    private static List<String> errorFields(BusinessException ex) {
        return ex.getErrors().stream().map(ErrorDetail::field).toList();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> out) {
        return (List<Map<String, Object>>) out.get("list");
    }

    // ── V3 마이그레이션 ─────────────────────────────────────────────

    @Test
    @DisplayName("V3 — 기존 시드는 기본값(TEXT·NORMAL·N)을 받고, 점검 시드 1건은 마크다운 예시로 바뀐다")
    void migrationDefaultsAndMdSeed() {
        Notice maint = repository.findById("NT202609030001").orElseThrow();
        assertThat(maint.getContentFormat()).isEqualTo("MD");
        assertThat(maint.getNoticeCategory()).isEqualTo("MAINT");
        assertThat(maint.getPinYn()).isEqualTo("Y");
        assertThat(maint.getContent()).startsWith("## 정기 점검 안내").contains("**첫째 주 토요일 02:00~04:00**");

        for (String id : List.of("NT202609030002", "NT202609030003")) {
            Notice n = repository.findById(id).orElseThrow();
            assertThat(n.getContentFormat()).as(id).isEqualTo("TEXT");
            assertThat(n.getNoticeCategory()).as(id).isEqualTo("NORMAL");
            assertThat(n.getPinYn()).as(id).isEqualTo("N");
        }
    }

    // ── save — 새 컬럼 ─────────────────────────────────────────────

    @Test
    @DisplayName("신규 행에 세 키가 없으면 기본값으로 저장하고, 조회 행에 세 키를 싣는다")
    void insertWithoutNewKeysUsesDefaults() {
        Notice n = create(newRow("기본값 공지"));

        assertThat(n.getContentFormat()).isEqualTo("TEXT");
        assertThat(n.getNoticeCategory()).isEqualTo("NORMAL");
        assertThat(n.getPinYn()).isEqualTo("N");

        Map<String, Object> row = list(service.search(null)).stream()
                .filter(r -> n.getNoticeId().equals(r.get("NOTICE_ID"))).findFirst().orElseThrow();
        assertThat(row).containsEntry("CONTENT_FORMAT", "TEXT")
                .containsEntry("NOTICE_CATEGORY", "NORMAL")
                .containsEntry("PIN_YN", "N");
    }

    @Test
    @DisplayName("세 값을 받아 저장한다 — 소문자 코드와 불리언 PIN_YN 도 정규화한다")
    void insertWithNewKeys() {
        Map<String, Object> row = newRow("긴급 마크다운");
        row.put("CONTENT_FORMAT", "md");
        row.put("NOTICE_CATEGORY", "URGENT");
        row.put("PIN_YN", Boolean.TRUE);

        Notice n = create(row);

        assertThat(n.getContentFormat()).isEqualTo("MD");
        assertThat(n.getNoticeCategory()).isEqualTo("URGENT");
        assertThat(n.getPinYn()).isEqualTo("Y");
    }

    @Test
    @DisplayName("허용 코드 밖의 형식·분류·고정 값은 행·필드 단위 오류로 거부하고 아무것도 저장하지 않는다")
    void invalidCodesRejected() {
        Map<String, Object> row = newRow("잘못된 코드");
        row.put("CONTENT_FORMAT", "PDF");
        row.put("NOTICE_CATEGORY", "EVENT");
        row.put("PIN_YN", "X");
        long before = repository.count();

        BusinessException ex = assertThrows(BusinessException.class, () -> service.save(List.of(row)));

        assertThat(errorFields(ex)).containsExactlyInAnyOrder("CONTENT_FORMAT", "NOTICE_CATEGORY", "PIN_YN");
        assertThat(ex.getErrors()).allMatch(e -> "master".equals(e.grid()) && Integer.valueOf(0).equals(e.rowIndex()));
        assertThat(repository.count()).isEqualTo(before);
    }

    @Test
    @DisplayName("본문 상한은 20만 자다 — 20만 자는 저장하고 20만 1자는 CONTENT 오류로 거부한다")
    void contentCapIsTwoHundredThousand() {
        Map<String, Object> ok = newRow("상한 공지");
        ok.put("CONTENT", "가".repeat(200_000));
        assertThat(create(ok).getContent()).hasSize(200_000);

        Map<String, Object> over = newRow("상한 초과");
        over.put("CONTENT", "가".repeat(200_001));
        BusinessException ex = assertThrows(BusinessException.class, () -> service.save(List.of(over)));
        assertThat(errorFields(ex)).containsExactly("CONTENT");
    }

    @Test
    @DisplayName("4000자 제한이 없다 — 5만 자 본문도 그대로 저장한다")
    void longContentAccepted() {
        Map<String, Object> row = newRow("긴 공지");
        String longText = "가".repeat(50_000);
        row.put("CONTENT", longText);

        Notice n = create(row);

        assertThat(n.getContent()).hasSize(50_000);
    }

    @Test
    @DisplayName("수정 행에 세 키가 없으면 저장된 값을 유지한다 — 세 컬럼을 모르는 이전 화면이 서식을 지우지 않는다")
    void updateWithoutKeysKeepsStoredValues() {
        Map<String, Object> row = newRow("유지 공지");
        row.put("CONTENT_FORMAT", "MD");
        row.put("NOTICE_CATEGORY", "MAINT");
        row.put("PIN_YN", "Y");
        Notice n = create(row);

        Map<String, Object> upd = updateRow(n);
        upd.put("TITLE", "유지 공지(수정)");
        service.save(List.of(upd));
        em.flush();
        em.clear();

        Notice after = repository.findById(n.getNoticeId()).orElseThrow();
        assertThat(after.getTitle()).isEqualTo("유지 공지(수정)");
        assertThat(after.getContentFormat()).isEqualTo("MD");
        assertThat(after.getNoticeCategory()).isEqualTo("MAINT");
        assertThat(after.getPinYn()).isEqualTo("Y");
    }

    @Test
    @DisplayName("수정 행에 세 키가 있고 값이 비어 있으면 기본값으로 되돌린다")
    void updateWithBlankKeysResetsToDefaults() {
        Map<String, Object> row = newRow("초기화 공지");
        row.put("CONTENT_FORMAT", "MD");
        row.put("NOTICE_CATEGORY", "URGENT");
        row.put("PIN_YN", "Y");
        Notice n = create(row);

        Map<String, Object> upd = updateRow(n);
        upd.put("CONTENT_FORMAT", "");
        upd.put("NOTICE_CATEGORY", null);
        upd.put("PIN_YN", " ");
        service.save(List.of(upd));
        em.flush();
        em.clear();

        Notice after = repository.findById(n.getNoticeId()).orElseThrow();
        assertThat(after.getContentFormat()).isEqualTo("TEXT");
        assertThat(after.getNoticeCategory()).isEqualTo("NORMAL");
        assertThat(after.getPinYn()).isEqualTo("N");
    }

    // ── save — HTML 소독 ───────────────────────────────────────────

    @Test
    @DisplayName("HTML 형식은 저장할 때 script·on* 속성·javascript: URL·인라인 style 을 걷어 낸다")
    void htmlSanitizedOnSave() {
        Map<String, Object> row = newRow("HTML 공지");
        row.put("CONTENT_FORMAT", "HTML");
        row.put("CONTENT", "<p style=\"color:red\" onclick=\"x()\">안내</p><script>alert(1)</script>"
                + "<a href=\"javascript:alert(2)\">링크</a><img src=x onerror=alert(3)><iframe src=\"https://evil\"></iframe>");

        Notice n = create(row);

        assertThat(n.getContent()).contains("<p>안내</p>")
                .doesNotContainIgnoringCase("script")
                .doesNotContainIgnoringCase("onclick")
                .doesNotContainIgnoringCase("onerror")
                .doesNotContainIgnoringCase("style=")
                .doesNotContainIgnoringCase("iframe")
                .doesNotContain("alert(");
    }

    @Test
    @DisplayName("TEXT·MD 형식 본문은 소독하지 않는다(렌더러가 HTML 로 해석하지 않는 형식)")
    void nonHtmlNotSanitized() {
        Map<String, Object> row = newRow("코드 예시 공지");
        row.put("CONTENT_FORMAT", "MD");
        row.put("CONTENT", "```html\n<script>예시</script>\n```");

        Notice n = create(row);

        assertThat(n.getContent()).isEqualTo("```html\n<script>예시</script>\n```");
    }

    @Test
    @DisplayName("형식 키 없이 수정해도 저장된 형식이 HTML 이면 새 본문을 소독한다")
    void htmlInheritedFormatSanitizedOnUpdate() {
        Map<String, Object> row = newRow("상속 HTML");
        row.put("CONTENT_FORMAT", "HTML");
        row.put("CONTENT", "<p>원문</p>");
        Notice n = create(row);

        Map<String, Object> upd = updateRow(n);
        upd.put("CONTENT", "<p>수정</p><script>alert(1)</script>");
        service.save(List.of(upd));
        em.flush();
        em.clear();

        Notice after = repository.findById(n.getNoticeId()).orElseThrow();
        assertThat(after.getContentFormat()).isEqualTo("HTML");
        assertThat(after.getContent()).isEqualTo("<p>수정</p>");
    }

    // ── search — 새 조회조건 ────────────────────────────────────────

    @Test
    @DisplayName("공지 분류·본문 형식 조건으로 거르고, 빈 값은 전체다")
    void searchByCategoryAndFormat() {
        Map<String, Object> urgentMd = newRow("검색-긴급MD");
        urgentMd.put("NOTICE_CATEGORY", "URGENT");
        urgentMd.put("CONTENT_FORMAT", "MD");
        Map<String, Object> urgentText = newRow("검색-긴급TEXT");
        urgentText.put("NOTICE_CATEGORY", "URGENT");
        Map<String, Object> normalMd = newRow("검색-일반MD");
        normalMd.put("CONTENT_FORMAT", "MD");
        service.save(List.of(urgentMd, urgentText, normalMd));

        NoticeMgmtSearchRequest q = new NoticeMgmtSearchRequest();
        q.setTitle("검색-");
        q.setNoticeCategory("URGENT");
        assertThat(titles(service.search(q))).containsExactlyInAnyOrder("검색-긴급MD", "검색-긴급TEXT");

        q.setContentFormat("md");
        assertThat(titles(service.search(q))).containsExactly("검색-긴급MD");

        q.setNoticeCategory("");
        assertThat(titles(service.search(q))).containsExactlyInAnyOrder("검색-긴급MD", "검색-일반MD");

        q.setContentFormat(null);
        assertThat(titles(service.search(q))).hasSize(3);
    }

    @Test
    @DisplayName("조회조건의 분류·형식이 허용 코드 밖이면 0건이 아니라 오류로 알린다")
    void searchRejectsUnknownCodes() {
        NoticeMgmtSearchRequest q = new NoticeMgmtSearchRequest();
        q.setNoticeCategory("EVENT");
        assertThrows(BusinessException.class, () -> service.search(q));

        NoticeMgmtSearchRequest q2 = new NoticeMgmtSearchRequest();
        q2.setContentFormat("PDF");
        assertThrows(BusinessException.class, () -> service.search(q2));
    }

    @Test
    @DisplayName("게시중 전환 규칙은 그대로다 — 게시기간이 있어야 POSTED 로 저장된다")
    void postedStillNeedsPeriod() {
        Map<String, Object> row = newRow("게시 공지");
        row.put("NOTICE_STATUS", "POSTED");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.save(List.of(row)));
        assertThat(errorFields(ex)).contains("POST_START_DT");

        row.put("POST_START_DT", START);
        row.put("POST_END_DT", END);
        assertThat(create(row).getNoticeStatus()).isEqualTo("POSTED");
    }

    // ── 게시 대상 (V4) ─────────────────────────────────────────────

    private List<String> storedRoles(String noticeId) {
        return targetRepository.findByNoticeIds(List.of(noticeId)).stream()
                .map(com.dongkuk.dmes.mls.entity.NoticeTarget::getRoleId).toList();
    }

    @Test
    @DisplayName("V4 — 기존 시드와 키 없는 신규 행은 전체 대상(ALL)이고 대상 역할이 없다")
    void targetDefaultsAll() {
        assertThat(repository.findById("NT202609030001").orElseThrow().getTargetScope()).isEqualTo("ALL");
        Notice n = create(newRow("대상 기본"));
        assertThat(n.getTargetScope()).isEqualTo("ALL");
        assertThat(storedRoles(n.getNoticeId())).isEmpty();
    }

    @Test
    @DisplayName("ROLE 대상은 역할 목록을 배열·콤마 문자열 모두로 받아 정규화해 저장하고, 조회 행에 TARGET_SCOPE·TARGET_ROLES 를 싣는다")
    void roleTargetsSavedAndReturned() {
        Map<String, Object> row = newRow("역할 대상");
        row.put("TARGET_SCOPE", "role");
        row.put("TARGET_ROLES", List.of(" mdm_steward", "SYSADMIN", "MDM_STEWARD", ""));
        Notice n = create(row);

        assertThat(n.getTargetScope()).isEqualTo("ROLE");
        assertThat(storedRoles(n.getNoticeId())).containsExactly("MDM_STEWARD", "SYSADMIN");

        Map<String, Object> r = list(service.search(null)).stream()
                .filter(x -> n.getNoticeId().equals(x.get("NOTICE_ID"))).findFirst().orElseThrow();
        assertThat(r).containsEntry("TARGET_SCOPE", "ROLE")
                .containsEntry("TARGET_ROLES", List.of("MDM_STEWARD", "SYSADMIN"));

        Map<String, Object> row2 = newRow("역할 대상 콤마");
        row2.put("TARGET_SCOPE", "ROLE");
        row2.put("TARGET_ROLES", "MDM_STD_ADMIN, MDM_STEWARD");
        assertThat(storedRoles(create(row2).getNoticeId())).containsExactly("MDM_STD_ADMIN", "MDM_STEWARD");
    }

    @Test
    @DisplayName("ROLE 인데 대상 역할이 비어 있으면 거부한다 — 신규·수정 모두")
    void roleScopeWithoutRolesRejected() {
        Map<String, Object> row = newRow("대상 없음");
        row.put("TARGET_SCOPE", "ROLE");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.save(List.of(row)));
        assertThat(errorFields(ex)).containsExactly("TARGET_ROLES");

        row.put("TARGET_ROLES", List.of());
        BusinessException ex2 = assertThrows(BusinessException.class, () -> service.save(List.of(row)));
        assertThat(errorFields(ex2)).containsExactly("TARGET_ROLES");

        // 저장된 공지(ALL)를 대상 목록 없이 ROLE 로만 바꾸는 것도 거부한다.
        Notice n = create(newRow("나중에 ROLE"));
        Map<String, Object> upd = updateRow(n);
        upd.put("TARGET_SCOPE", "ROLE");
        BusinessException ex3 = assertThrows(BusinessException.class, () -> service.save(List.of(upd)));
        assertThat(errorFields(ex3)).containsExactly("TARGET_ROLES");
    }

    @Test
    @DisplayName("허용 밖 범위 값·역할 ID 형식은 거부한다")
    void invalidScopeOrRoleRejected() {
        Map<String, Object> row = newRow("잘못된 범위");
        row.put("TARGET_SCOPE", "GROUP");
        assertThat(errorFields(assertThrows(BusinessException.class, () -> service.save(List.of(row)))))
                .containsExactly("TARGET_SCOPE");

        Map<String, Object> row2 = newRow("잘못된 역할");
        row2.put("TARGET_SCOPE", "ROLE");
        row2.put("TARGET_ROLES", List.of("MDM STEWARD';--"));
        assertThat(errorFields(assertThrows(BusinessException.class, () -> service.save(List.of(row2)))))
                .containsExactly("TARGET_ROLES");
    }

    @Test
    @DisplayName("수정 — 키가 없으면 대상 유지, 목록이 오면 빠진 것만 지우고 새 것만 넣는다, ALL 로 바꾸면 대상을 비운다")
    void updateTargets() {
        Map<String, Object> row = newRow("대상 수정");
        row.put("TARGET_SCOPE", "ROLE");
        row.put("TARGET_ROLES", List.of("A_ROLE", "B_ROLE"));
        Notice n = create(row);

        Map<String, Object> keep = updateRow(n);
        keep.put("TITLE", "대상 수정(제목만)");
        service.save(List.of(keep));
        em.flush();
        em.clear();
        assertThat(repository.findById(n.getNoticeId()).orElseThrow().getTargetScope()).isEqualTo("ROLE");
        assertThat(storedRoles(n.getNoticeId())).containsExactly("A_ROLE", "B_ROLE");

        // 같은 트랜잭션에서 B_ROLE 을 유지·A_ROLE 제거·C_ROLE 추가 — 일괄 DELETE 를 쓰지 않으므로 PK 충돌이 없다.
        Map<String, Object> change = updateRow(repository.findById(n.getNoticeId()).orElseThrow());
        change.put("TARGET_ROLES", List.of("B_ROLE", "C_ROLE"));
        service.save(List.of(change));
        em.flush();
        em.clear();
        assertThat(storedRoles(n.getNoticeId())).containsExactly("B_ROLE", "C_ROLE");

        Map<String, Object> all = updateRow(repository.findById(n.getNoticeId()).orElseThrow());
        all.put("TARGET_SCOPE", "ALL");
        service.save(List.of(all));
        em.flush();
        em.clear();
        assertThat(repository.findById(n.getNoticeId()).orElseThrow().getTargetScope()).isEqualTo("ALL");
        assertThat(storedRoles(n.getNoticeId())).isEmpty();
    }

    @Test
    @DisplayName("공지를 지우면 대상 역할 행도 함께 지운다")
    void deleteRemovesTargets() {
        Map<String, Object> row = newRow("삭제 대상");
        row.put("TARGET_SCOPE", "ROLE");
        row.put("TARGET_ROLES", List.of("A_ROLE"));
        Notice n = create(row);

        Map<String, Object> del = new HashMap<>();
        del.put("rowStatus", "D");
        del.put("NOTICE_ID", n.getNoticeId());
        service.save(List.of(del));
        em.flush();
        em.clear();

        assertThat(repository.findById(n.getNoticeId())).isEmpty();
        assertThat(storedRoles(n.getNoticeId())).isEmpty();
    }

    @Test
    @DisplayName("save 응답 savedIds — 저장(C/U)한 공지번호를 입력 행 순서대로, 신규는 채번값으로 돌려주고 삭제 행은 뺀다")
    void saveReturnsSavedIds() {
        Notice existing = create(newRow("기존 공지"));
        Notice toDelete = create(newRow("지울 공지"));

        Map<String, Object> upd = updateRow(existing);
        upd.put("TITLE", "기존 공지(수정)");
        Map<String, Object> del = new HashMap<>();
        del.put("rowStatus", "D");
        del.put("NOTICE_ID", toDelete.getNoticeId());
        Map<String, Object> unchanged = new HashMap<>();
        unchanged.put("NOTICE_ID", existing.getNoticeId());

        Map<String, Object> out = service.save(List.of(newRow("새 공지 1"), upd, del, unchanged, newRow("새 공지 2")));

        @SuppressWarnings("unchecked")
        List<String> savedIds = (List<String>) out.get("savedIds");
        assertThat(out.get("cntMerge")).isEqualTo(4);
        assertThat(savedIds).hasSize(3);
        assertThat(savedIds.get(1)).isEqualTo(existing.getNoticeId());
        Map<Object, Object> titleById = new HashMap<>();
        list(out).forEach(r -> titleById.put(r.get("NOTICE_ID"), r.get("TITLE")));
        assertThat(titleById.get(savedIds.get(0))).isEqualTo("새 공지 1");
        assertThat(titleById.get(savedIds.get(2))).isEqualTo("새 공지 2");
        assertThat(savedIds).doesNotContain(toDelete.getNoticeId());
    }

    // ── 첫 조회 상한·본문 제외·상세 조회(화면 성능 가이드 R1) ──

    @Test
    @DisplayName("includeContent=false 면 목록 행에 CONTENT 가 없고 나머지 칸은 그대로다")
    void 목록_요약은_본문을_싣지_않는다() {
        create(newRow("요약 공지"));
        NoticeMgmtSearchRequest q = new NoticeMgmtSearchRequest();
        q.setIncludeContent(false);

        Map<String, Object> full = list(service.search(null)).stream()
                .filter(r -> "요약 공지".equals(r.get("TITLE"))).findFirst().orElseThrow();
        Map<String, Object> summary = list(service.search(q)).stream()
                .filter(r -> "요약 공지".equals(r.get("TITLE"))).findFirst().orElseThrow();

        assertThat(full).containsKey("CONTENT");
        assertThat(summary).doesNotContainKey("CONTENT");
        Map<String, Object> fullWithoutContent = new HashMap<>(full);
        fullWithoutContent.remove("CONTENT");
        assertThat(summary).isEqualTo(fullWithoutContent);
    }

    @Test
    @DisplayName("noticeId 상세 조회는 본문을 포함한 한 건이고, 없는 번호는 빈 목록이다")
    void 상세_조회는_본문_포함_한_건() {
        Notice n = create(newRow("상세 공지"));
        NoticeMgmtSearchRequest q = new NoticeMgmtSearchRequest();
        q.setNoticeId(n.getNoticeId());
        NoticeMgmtSearchRequest none = new NoticeMgmtSearchRequest();
        none.setNoticeId("NT00000000X");

        List<Map<String, Object>> one = list(service.search(q));

        assertThat(one).hasSize(1);
        assertThat(one.get(0).get("CONTENT")).isEqualTo("본문");
        assertThat(list(service.search(none))).isEmpty();
    }

    @Test
    @DisplayName("조건 없는 조회에 limit 이 오면 NOTICE_ID 내림차순 앞쪽만 주고 전체 건수·잘림을 알린다")
    void 조건_없는_조회에_limit_이_오면_앞쪽만_주고_잘림을_알린다() {
        create(newRow("공지 가"));
        create(newRow("공지 나"));
        create(newRow("공지 다"));
        long total = repository.count();
        NoticeMgmtSearchRequest q = new NoticeMgmtSearchRequest();
        q.setLimit(2);
        q.setIncludeContent(false);
        List<String> expected = repository.searchAll().stream().limit(2).map(Notice::getNoticeId).toList();

        Map<String, Object> out = service.search(q);

        assertThat(list(out).stream().map(r -> (String) r.get("NOTICE_ID")).toList()).isEqualTo(expected);
        assertThat(out.get("totalCount")).isEqualTo(total);
        assertThat(out.get("truncated")).isEqualTo(true);
    }

    @Test
    @DisplayName("limit 이 없거나 조건이 있으면 상한 없이 전부 주고, limit 이 본문 포함 조회에도 걸린다")
    void limit_이_없거나_조건이_있으면_전부_준다() {
        create(newRow("조건 공지 가"));
        create(newRow("조건 공지 나"));
        NoticeMgmtSearchRequest withTitle = new NoticeMgmtSearchRequest();
        withTitle.setTitle("조건 공지");
        withTitle.setLimit(1);
        NoticeMgmtSearchRequest withContent = new NoticeMgmtSearchRequest();
        withContent.setLimit(1);

        Map<String, Object> noLimit = service.search(null);
        Map<String, Object> conditioned = service.search(withTitle);
        Map<String, Object> limitedWithContent = service.search(withContent);

        assertThat(noLimit).doesNotContainKeys("totalCount", "truncated");
        assertThat(list(conditioned)).hasSize(2);
        assertThat(conditioned.get("truncated")).isEqualTo(false);
        assertThat(list(limitedWithContent)).hasSize(1);
        assertThat(list(limitedWithContent).get(0)).containsKey("CONTENT");
        assertThat(limitedWithContent.get("truncated")).isEqualTo(true);
    }

    @Test
    @DisplayName("저장·상태변경 응답의 전체 목록은 본문 없는 요약이다")
    void 저장_응답_목록은_본문을_싣지_않는다() {
        Map<String, Object> saved = service.save(List.of(newRow("응답 요약 공지")));

        assertThat(list(saved)).isNotEmpty();
        assertThat(list(saved)).allSatisfy(r -> assertThat(r).doesNotContainKey("CONTENT").containsKey("NOTICE_ID"));
        assertThat(titles(saved)).contains("응답 요약 공지");
    }

    private static List<Object> titles(Map<String, Object> out) {
        return list(out).stream().map(r -> r.get("TITLE")).toList();
    }
}
