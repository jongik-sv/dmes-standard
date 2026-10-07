package com.dongkuk.dmes.mcm.oracheck;

import com.dongkuk.dmes.mcm.repository.MomTcErrorRepository;
import com.dongkuk.dmes.mcm.repository.TcErrorRowView;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link MomTcErrorRepository#search} (tcErrorList 조회)를 실제 Oracle 에서 돌려 본다 — oracle-1007 c2 가 바꾼 부분:
 * 따옴표 camelCase 별칭 → 인터페이스 투영({@link TcErrorRowView}), {@code TO_CHAR(C_AT, 'YYYY-MM-DD HH24:MI:SS')},
 * {@code CAST(… AS NUMERIC(19))}, {@code LIKE '%' || :p || '%'}, null 인자(`:p IS NULL OR …`).
 *
 * <p>{@code C_AT} 는 엔티티가 아니라 SQL 의 {@code TIMESTAMP '…'} 리터럴로 넣는다 — 엔티티 왕복은 시간대 어긋남을 양쪽에서 상쇄해 감춘다.
 * 저장값은 KST 벽시계이고(JVM 시간대 Asia/Seoul 은 시험 하니스가 고정한다) 날짜 조건은 {@link Instant} 로 받는다.
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class MomTcErrorSearchOraTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @Autowired MomTcErrorRepository repo;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_MOM_TC_SEND");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_MOM_TC_ERROR");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_MOM_TC_LIST");
    }

    private void error(long sq, String ts, String tcCode, String ifId, String errCode, String msg, String interfaceMsg) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_MOM_TC_ERROR (SQ_VAL, C_AT, TRANSACTION_CODE, INTERFACE_ID, ERROR_TYPE, ERROR_CODE, ERROR_MSG, INTERFACE_MSG) "
                + "VALUES (?, TIMESTAMP '" + ts + "', ?, ?, 'ERR', ?, ?, ?)", sq, tcCode, ifId, errCode, msg, interfaceMsg);
    }

    private void send(long sendSq, long errSq) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_MOM_TC_SEND (SEND_SQ_VAL, ERR_SQ_VAL) VALUES (?, ?)", sendSq, errSq);
    }

    /** 101(09:30:00, TC1 있음, 재전송 2건) · 102(10:45:30, TC2 는 목록에 없음) · 103(전날 23:59:59, TC1). */
    private void fixture() {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_MOM_TC_LIST (TRANSACTION_CODE, FORMAT_ID, USE_TP, TRANSACTION_NM) VALUES ('TC1', 'F1', 'Y', '첫 전문')");
        error(101, "2026-10-02 09:30:00", "TC1", "IF_ALPHA", "E100", "msg-101", "본문-101");
        error(102, "2026-10-02 10:45:30", "TC2", "IF_BETA", "E200", "msg-102", null);
        error(103, "2026-10-01 23:59:59", "TC1", "IF_ALPHA", "E300", "msg-103", null);
        send(1, 101);
        send(2, 101);
    }

    private static Instant kst(String localDateTime) {
        return java.time.LocalDateTime.parse(localDateTime).atZone(KST).toInstant();
    }

    /** c2: 조건이 모두 null 인 기본 화면 경로 — 따옴표 별칭 투영·TO_CHAR·NUMERIC(19) CAST·LEFT JOIN·재전송 COUNT. */
    @Test
    @DisplayName("search — 조건 전부 null: C_AT 내림차순 3건, 따옴표 camelCase 별칭이 투영으로 읽히고 TO_CHAR 글자 형식이 맞는다")
    void search_allNull_projection() {
        fixture();

        List<TcErrorRowView> rows = repo.search(null, null, null, null, null);

        assertThat(rows).extracting(TcErrorRowView::getSqVal).containsExactly(102L, 101L, 103L);
        TcErrorRowView r101 = rows.get(1);
        assertThat(r101.getTransactionCode()).isEqualTo("TC1");
        assertThat(r101.getTransactionNm()).isEqualTo("첫 전문");
        assertThat(r101.getInterfaceId()).isEqualTo("IF_ALPHA");
        assertThat(r101.getErrorType()).isEqualTo("ERR");
        assertThat(r101.getErrorCode()).isEqualTo("E100");
        assertThat(r101.getErrorMsg()).isEqualTo("msg-101");
        assertThat(r101.getCreationTimestamp()).isEqualTo("2026-10-02 09:30:00");
        assertThat(r101.getResendCnt()).isEqualTo(2L);
        // 전문 목록에 없는 TC2 도 LEFT JOIN 이라 나온다
        assertThat(rows.get(0).getTransactionNm()).isNull();
        assertThat(rows.get(0).getResendCnt()).isZero();
        assertThat(rows.get(0).getCreationTimestamp()).isEqualTo("2026-10-02 10:45:30");
    }

    /** c2: 투영 getter(String)로 읽는 NCLOB 칸 INTERFACE_MSG — Clob 계열 값이 글자열로 변환되는지. */
    @Test
    @DisplayName("search — NCLOB 칸 INTERFACE_MSG 가 String 투영으로 읽힌다")
    void search_nclobInterfaceMsg() {
        fixture();

        TcErrorRowView r101 = repo.search(null, null, null, null, "TC1").stream()
                .filter(r -> r.getSqVal() == 101L).findFirst().orElseThrow();

        assertThat(r101.getInterfaceMsg()).isEqualTo("본문-101");
    }

    /** c2: 날짜 조건이 KST 벽시계 기준 — Instant 인자(UTC)를 KST 로 바꿔 C_AT(저장값 KST) 와 비교한다. 경계는 포함. */
    @Test
    @DisplayName("search — 발생일시 from·to 는 KST 기준(경계 포함), 1초 벗어나면 제외")
    void search_dateRangeKst() {
        fixture();

        // 101 은 09:30:00 정각 — Instant.parse("2026-10-02T00:30:00Z") 와 같은 순간
        Instant from = Instant.parse("2026-10-02T00:30:00Z");
        assertThat(repo.search(from, null, null, null, null)).extracting(TcErrorRowView::getSqVal)
                .containsExactly(102L, 101L);
        assertThat(repo.search(from.plusSeconds(1), null, null, null, null)).extracting(TcErrorRowView::getSqVal)
                .containsExactly(102L);
        assertThat(repo.search(null, from, null, null, null)).extracting(TcErrorRowView::getSqVal)
                .containsExactly(101L, 103L);
        assertThat(repo.search(null, from.minusSeconds(1), null, null, null)).extracting(TcErrorRowView::getSqVal)
                .containsExactly(103L);
        assertThat(repo.search(kst("2026-10-02T09:00:00"), kst("2026-10-02T10:00:00"), null, null, null))
                .extracting(TcErrorRowView::getSqVal).containsExactly(101L);
    }

    /** c2: 인터페이스·에러코드·전문코드 LIKE 가 {@code '%' || :p || '%'} 로 부분 일치한다(대소문자 구분). */
    @Test
    @DisplayName("search — 부문(INTERFACE_ID)·CODE·전문코드 LIKE 부분 일치, 조건끼리 AND")
    void search_likeFilters() {
        fixture();

        assertThat(repo.search(null, null, "ALPHA", null, null)).extracting(TcErrorRowView::getSqVal).containsExactly(101L, 103L);
        assertThat(repo.search(null, null, null, "E2", null)).extracting(TcErrorRowView::getSqVal).containsExactly(102L);
        assertThat(repo.search(null, null, null, null, "TC")).hasSize(3);
        assertThat(repo.search(null, null, "ALPHA", "E3", "TC1")).extracting(TcErrorRowView::getSqVal).containsExactly(103L);
        assertThat(repo.search(null, null, "alpha", null, null)).isEmpty();
    }
}
