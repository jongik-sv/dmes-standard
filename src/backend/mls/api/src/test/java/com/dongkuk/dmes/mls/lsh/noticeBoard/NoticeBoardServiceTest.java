package com.dongkuk.dmes.mls.lsh.noticeBoard;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import com.dongkuk.dmes.mls.entity.Notice;
import com.dongkuk.dmes.mls.entity.NoticeTarget;
import com.dongkuk.dmes.mls.lsh.noticeBoard.dto.NoticeBoardSearchRequest;
import com.dongkuk.dmes.mls.lsh.noticeBoard.service.NoticeBoardService;
import com.dongkuk.dmes.mls.repository.NoticeRepository;
import com.dongkuk.dmes.mls.repository.NoticeTargetRepository;
import com.dongkuk.dmes.mls.testdb.MlsTestDb;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * noticeBoard(포털 홈 공지 목록) — 게시중이고 오늘이 게시기간 안인 공지만, 상단 고정 → 긴급 → 등록 최신순, 최대 50건.
 * 날짜는 시드의 절대 날짜에 기대지 않고 오늘 기준 상대 날짜로 만든다. 시험마다 표를 비우고 트랜잭션 롤백으로 되돌린다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Transactional
class NoticeBoardServiceTest extends MlsTestDb {

    @Autowired
    NoticeBoardService service;
    @Autowired
    NoticeRepository repository;
    @Autowired
    EntityManager em;
    @Autowired
    DataSource dataSource;
    @Autowired
    NoticeTargetRepository targetRepository;

    private static final LocalDate TODAY = LocalDate.now();
    private int seq;

    @BeforeEach
    void emptyTable() {
        targetRepository.deleteAll();
        repository.deleteAll();
        repository.flush();
        UserContextHolder.clear();
    }

    @AfterEach
    void clearUser() {
        UserContextHolder.clear();
    }

    /** 요청 사용자 문맥 — 실제 요청에서는 ClientKeyFilter·JwtAuthenticationFilter 가 ROLE_ 접두를 붙여 채운다. */
    private static void loginAs(String... roles) {
        UserContextHolder.set(new UserInfo("user01", "사용자", null,
                java.util.Arrays.stream(roles).map(r -> "ROLE_" + r).toList()));
    }

    private Notice forRoles(String title, String... roleIds) {
        Notice n = posted(title);
        n.setTargetScope("ROLE");
        repository.saveAndFlush(n);
        for (String roleId : roleIds) {
            targetRepository.saveAndFlush(new NoticeTarget(n.getNoticeId(), roleId));
        }
        return n;
    }

    /** 공지 1건 저장. 등록 시각(C_AT)이 저장 순서대로 달라지도록 저장 사이에 간격을 둔다. */
    private Notice notice(String title, String status, LocalDate start, LocalDate end, String category, String pinYn) {
        Notice n = new Notice(String.format("NTTEST%06d", ++seq));
        n.setTitle(title);
        n.setContent(title + " 본문");
        n.setNoticeStatus(status);
        n.setPostStartDt(start);
        n.setPostEndDt(end);
        n.setNoticeCategory(category);
        n.setPinYn(pinYn);
        Notice saved = repository.saveAndFlush(n);
        try {
            Thread.sleep(3);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return saved;
    }

    private Notice posted(String title) {
        return notice(title, "POSTED", TODAY.minusDays(1), TODAY.plusDays(1), "NORMAL", "N");
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> board(Integer limit) {
        NoticeBoardSearchRequest q = new NoticeBoardSearchRequest();
        q.setLimit(limit);
        em.clear();
        return (List<Map<String, Object>>) service.search(q).get("list");
    }

    private List<Object> titles(Integer limit) {
        return board(limit).stream().map(r -> r.get("TITLE")).toList();
    }

    @Test
    @DisplayName("게시중이고 오늘이 게시기간 안인 공지만 — 경계일 포함, 비어 있는 시작·종료는 열린 구간")
    void filtersByStatusAndPeriod() {
        posted("기간 안");
        notice("오늘 하루", "POSTED", TODAY, TODAY, "NORMAL", "N");
        notice("시작 없음", "POSTED", null, TODAY.plusDays(3), "NORMAL", "N");
        notice("종료 없음", "POSTED", TODAY.minusDays(3), null, "NORMAL", "N");
        notice("기간 없음", "POSTED", null, null, "NORMAL", "N");
        notice("아직 시작 전", "POSTED", TODAY.plusDays(1), TODAY.plusDays(5), "NORMAL", "N");
        notice("이미 끝남", "POSTED", TODAY.minusDays(5), TODAY.minusDays(1), "NORMAL", "N");
        notice("작성중", "DRAFT", TODAY.minusDays(1), TODAY.plusDays(1), "URGENT", "Y");
        notice("게시중지", "STOPPED", TODAY.minusDays(1), TODAY.plusDays(1), "URGENT", "Y");

        assertThat(titles(null)).containsExactlyInAnyOrder("기간 안", "오늘 하루", "시작 없음", "종료 없음", "기간 없음");
    }

    @Test
    @DisplayName("정렬 — 상단 고정 먼저, 그다음 긴급, 그다음 등록 최신순")
    void ordersByPinThenUrgentThenNewest() {
        notice("고정-일반-오래됨", "POSTED", TODAY.minusDays(1), TODAY.plusDays(1), "NORMAL", "Y");
        notice("일반-오래됨", "POSTED", TODAY.minusDays(1), TODAY.plusDays(1), "NORMAL", "N");
        notice("긴급-오래됨", "POSTED", TODAY.minusDays(1), TODAY.plusDays(1), "URGENT", "N");
        notice("점검-새것", "POSTED", TODAY.minusDays(1), TODAY.plusDays(1), "MAINT", "N");
        notice("긴급-새것", "POSTED", TODAY.minusDays(1), TODAY.plusDays(1), "URGENT", "N");
        notice("고정-긴급-새것", "POSTED", TODAY.minusDays(1), TODAY.plusDays(1), "URGENT", "Y");

        assertThat(titles(null)).containsExactly(
                "고정-긴급-새것", "고정-일반-오래됨",
                "긴급-새것", "긴급-오래됨",
                "점검-새것", "일반-오래됨");
    }

    @Test
    @DisplayName("등록 시각이 비어 있는 행(C_AT NULL)은 같은 묶음의 맨 뒤로 간다")
    void nullCreatedAtGoesLast() {
        posted("오래됨");
        Notice newer = posted("시각 없음");
        new JdbcTemplate(dataSource).update("UPDATE TB_MLS_NOTICE SET C_AT = NULL WHERE NOTICE_ID = ?", newer.getNoticeId());

        // 공지번호로는 "시각 없음" 이 더 최신이지만, 등록 시각이 없으면 시각이 있는 행 뒤로 간다.
        assertThat(titles(null)).containsExactly("오래됨", "시각 없음");
    }

    @Test
    @DisplayName("최대 50건 — limit 이 없거나 범위 밖이면 50, 1~50 이면 그 수")
    void limitIsCappedAtFifty() {
        for (int i = 0; i < 55; i++) {
            Notice n = new Notice(String.format("NTBULK%06d", i));
            n.setTitle("대량 " + i);
            n.setNoticeStatus("POSTED");
            n.setPostStartDt(TODAY.minusDays(1));
            n.setPostEndDt(TODAY.plusDays(1));
            repository.save(n);
        }
        repository.flush();

        assertThat(board(null)).hasSize(50);
        assertThat(board(0)).hasSize(50);
        assertThat(board(999)).hasSize(50);
        assertThat(board(5)).hasSize(5);
    }

    @Test
    @DisplayName("행 키는 DB 컬럼명 그대로 10개다")
    void rowKeys() {
        Notice n = notice("키 확인", "POSTED", TODAY.minusDays(1), TODAY.plusDays(1), "MAINT", "Y");

        Map<String, Object> row = board(null).get(0);

        assertThat(row.keySet()).containsExactly("NOTICE_ID", "TITLE", "CONTENT", "CONTENT_FORMAT", "NOTICE_CATEGORY",
                "PIN_YN", "POST_START_DT", "POST_END_DT", "C_USR_ID", "C_AT");
        assertThat(row).containsEntry("NOTICE_ID", n.getNoticeId())
                .containsEntry("CONTENT_FORMAT", "TEXT")
                .containsEntry("NOTICE_CATEGORY", "MAINT")
                .containsEntry("PIN_YN", "Y")
                .containsEntry("POST_START_DT", TODAY.minusDays(1).toString())
                .containsEntry("POST_END_DT", TODAY.plusDays(1).toString());
        assertThat(row.get("C_AT")).isNotNull();
    }

    @Test
    @DisplayName("DB 에 소독 안 된 HTML 이 들어 있어도 홈으로 내려보낼 때 다시 소독한다")
    void htmlSanitizedOnRead() {
        Notice n = posted("직접 넣은 HTML");
        new JdbcTemplate(dataSource).update(
                "UPDATE TB_MLS_NOTICE SET CONTENT_FORMAT = 'HTML', CONTENT = ? WHERE NOTICE_ID = ?",
                "<p onclick=\"x()\">안내</p><script>alert(1)</script>", n.getNoticeId());

        assertThat(board(null).get(0).get("CONTENT")).isEqualTo("<p>안내</p>");
    }

    // ── 게시 대상 (V4) ─────────────────────────────────────────────

    @Test
    @DisplayName("대상 — 전체 공지는 누구에게나, 역할 공지는 그 역할을 가진 사용자에게만 보인다")
    void targetFilterByRole() {
        posted("전체");
        forRoles("담당자용", "MDM_STEWARD");
        forRoles("관리자용", "SYSADMIN");
        forRoles("둘 다", "MDM_STEWARD", "SYSADMIN");

        loginAs("MDM_STEWARD");
        assertThat(titles(null)).containsExactlyInAnyOrder("전체", "담당자용", "둘 다");

        loginAs("SYSADMIN");
        assertThat(titles(null)).containsExactlyInAnyOrder("전체", "관리자용", "둘 다");

        loginAs("MDM_STD_ADMIN", "MDM_STEWARD");
        assertThat(titles(null)).containsExactlyInAnyOrder("전체", "담당자용", "둘 다");

        loginAs("OTHER_ROLE");
        assertThat(titles(null)).containsExactly("전체");
    }

    @Test
    @DisplayName("대상 — 역할이 없거나 사용자 문맥이 없으면 전체 공지만 보인다")
    void targetFilterWithoutRoles() {
        posted("전체");
        forRoles("담당자용", "MDM_STEWARD");

        UserContextHolder.clear();
        assertThat(titles(null)).containsExactly("전체");

        UserContextHolder.set(new UserInfo("user01", "사용자", null, List.of()));
        assertThat(titles(null)).containsExactly("전체");
    }

    @Test
    @DisplayName("대상 — ROLE 범위인데 대상 행이 하나도 없는 공지는 아무에게도 보이지 않는다")
    void roleScopeWithoutTargetsHidden() {
        forRoles("대상 없음");
        loginAs("SYSADMIN");
        assertThat(titles(null)).isEmpty();
    }
}
