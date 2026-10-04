package com.dongkuk.dmes.mdm.dmb.layoutConfirm;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.perf.QueryCountProbe;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.dmb.LayoutTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutQueries;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.dmb.layout.confirm.LayoutHeaderImpact;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * 헤더 확정 영향도({@link LayoutHeaderImpact#evaluate}) 합성 결과 고정 — 묶음 조회 리팩토링(전문·헤더 버전·항목을 한 번에 읽기) 전후로
 * {@link LayoutHeaderImpact.Result} 전체(영향 행·오류·경고·EAI)가 같아야 한다. 행은 JDBC 로 직접 넣는다(실제 SQLite 스키마).
 *
 * <p>정렬 — 영향 행은 (LAYOUT_ID, VER) 순, 오류·경고는 itemKey 순(같은 itemKey 안의 순서는 그대로)으로 맞춰 비교한다. 지금 행 순서는
 * {@code stacksUsing} 의 {@code ORDER BY h.layoutId} 만 보장하고 같은 전문의 버전 순서는 SQL 이 정하지 않기 때문이다.
 *
 * <p>고정한 경우 — 전문 여러 개(대상 헤더가 1번째·2번째 적층), 헤더 여러 개, 헤더 버전 경계(다른 쌓인 헤더의 apply_from 과 판정 시각이
 * 같음·1초 전), 전문 버전 거르기(apply_to == apply_from 제외·1초 뒤 포함·미래 RELEASED 는 자기 apply_from·DRAFT 포함·LEGACY 제외),
 * minor 버전(SQLite REAL), 항목 추가·삭제·변경(L16·L12 새로 생김=오류·이미 있음=경고, ORPHAN_OVERRIDE), "전" 합성 실패(첫 확정),
 * "후" 합성 실패(HEADER_UNRESOLVED), 영향 없음, EAI 표준 헤더 전환, 같은 트랜잭션 안에서 flush 전 JPA 변경이 결과에 보이는 경우.
 *
 * <p>쿼리 수는 운영(OASIS 트랜잭션)처럼 트랜잭션 안에서 재어 {@code [query-count] headerImpact …} 로 찍기만 한다 — 줄일 값이라 단언하지 않는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutHeaderImpactEquivalenceSqliteTest extends LayoutTestSupport {

    // 헤더
    static final long H = 9301;      // 대상 헤더 HA — v1 [01-01, 07-01) own 10, v2 [07-01, ∞) own 14, DRAFT 2.001(시험마다)
    static final long G = 9302;      // 다른 쌓인 헤더 HB — v1 [01-01, 09-01) own 5, v2 [09-01, ∞) own 8
    static final long U = 9303;      // RELEASED 없는 헤더 HC — 쌓은 전문은 합성 실패
    static final long N = 9304;      // 다른 헤더 HD — 대상 헤더를 안 쓰는 전문만 쌓는다
    static final long F = 9305;      // 첫 확정 헤더 HE — DRAFT 1.000 만
    static final long Z = 9306;      // 아무도 안 쓰는 헤더 HF — RELEASED 1.000, DRAFT 1.001
    // 전문
    static final long M1 = 9311;     // H(1)·G(2), 재정의 H.SND_FAC_TP=B9
    static final long M2 = 9312;     // G(1)·H(2) — 1.000 [01-01, 09-01), 1.001 미래 [09-01, ∞), 2.000 DRAFT(H 만, 재정의 B7)
    static final long M3 = 9313;     // 1.000 apply_to == 판정 시각(제외), 2.000 [08-01, ∞)
    static final long M4 = 9314;     // apply_to = 판정 시각 + 1초(포함), 본문 980(총 길이 994)
    static final long M5 = 9315;     // N 만 쌓는다(영향 없음)
    static final long M6 = 9316;     // H(1)·U(2) — 전후 모두 합성 실패
    static final long M7 = 9317;     // 본문 990(총 길이 1004 — L16 이미 있음), 재정의 H.SND_FAC_TP=TOOLONG(L12 이미 있음)
    static final long M8 = 9318;     // LEGACY 스냅샷 버전만(제외)
    static final long M9 = 9319;     // F 를 쌓은 DRAFT 전문 — "전" 합성 실패

    static final LocalDateTime AUG1 = LocalDateTime.of(2026, 8, 1, 0, 0, 0);
    static final String OPEN = "9999-12-31 00:00:00";
    static final BigDecimal DRAFT = new BigDecimal("2.001");

    @Autowired
    LayoutHeaderImpact impact;
    @Autowired
    LayoutQueries queries;
    @Autowired
    LayoutVersionStore store;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    PlatformTransactionManager tm;
    @Autowired
    EntityManager em;
    @Autowired
    EntityManagerFactory emf;

    QueryCountProbe probe;

    @BeforeEach
    void seed() {
        currentUser.set("kim", STEWARD);
        probe = new QueryCountProbe(tm, em, emf, "headerImpact");
        probe.start();
        dictionary();
        column("LEN3", "길이 3자리", null, domain("T_NUM_3", "QTY", "NUMBER", 3, 0, null));
        String range = " WHERE LAYOUT_ID BETWEEN 9300 AND 9399";
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_CONST" + range);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_HEADER" + range);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_ITEM" + range);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_VER" + range);
        jdbc.update("DELETE FROM TB_MDM_EAI WHERE EAI_CODE IN ('HIX1', 'HIX2')");
        jdbc.update("DELETE FROM TB_MDM_LAYOUT" + range);
        jdbc.update("INSERT INTO TB_MDM_EAI (EAI_CODE, EAI_NAME, ENCODING) VALUES ('HIX1', '영향 EAI 1', 'UTF-8'), ('HIX2', '영향 EAI 2', 'UTF-8')");

        layout(H, "HEADER", "HA");
        layout(G, "HEADER", "HB");
        layout(U, "HEADER", "HC");
        layout(N, "HEADER", "HD");
        layout(F, "HEADER", "HE");
        layout(Z, "HEADER", "HF");
        for (long m : new long[] {M1, M2, M3, M4, M5, M6, M7, M8, M9}) {
            layout(m, "MESSAGE", "M" + (m - 9310));
        }

        // H — v1: SND_FAC_TP(4)·여분 6 / v2: SND_FAC_TP(4)·LEN3 MSG_LENGTH(3)·여분 7
        ver(H, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", "2026-07-01 00:00:00", 10, "HIX1");
        item(H, "1.000", 1, "CONST", "SND_FAC_TP", "B0", null, 0, 4);
        item(H, "1.000", 2, "FILLER", null, null, 6, 4, 6);
        ver(H, "2.000", "MAJOR", "RELEASED", "2026-07-01 00:00:00", OPEN, 14, "HIX1");
        hV2Items(H, "2.000");
        // G — v1: LINE_CODE(2)·여분 3 / v2: LINE_CODE(2)·여분 6
        ver(G, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", "2026-09-01 00:00:00", 5, "HIX2");
        item(G, "1.000", 1, "CONST", "LINE_CODE", "B1", null, 0, 2);
        item(G, "1.000", 2, "FILLER", null, null, 3, 2, 3);
        ver(G, "2.000", "MAJOR", "RELEASED", "2026-09-01 00:00:00", OPEN, 8, "HIX2");
        item(G, "2.000", 1, "CONST", "LINE_CODE", "B1", null, 0, 2);
        item(G, "2.000", 2, "FILLER", null, null, 6, 2, 6);
        // U — DRAFT 뿐
        ver(U, "1.000", "MAJOR", "DRAFT", null, null, 4, null);
        item(U, "1.000", 1, "FILLER", null, null, 4, 0, 4);
        // N
        ver(N, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", OPEN, 3, null);
        item(N, "1.000", 1, "FILLER", null, null, 3, 0, 3);
        // F — 첫 확정(DRAFT 1.000 만)
        ver(F, "1.000", "MAJOR", "DRAFT", null, null, 6, null);
        item(F, "1.000", 1, "CONST", "SND_FAC_TP", "F0", null, 0, 4);
        item(F, "1.000", 2, "FILLER", null, null, 2, 4, 2);
        // Z — 아무도 안 쓴다
        ver(Z, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", OPEN, 5, null);
        item(Z, "1.000", 1, "FILLER", null, null, 5, 0, 5);
        ver(Z, "1.001", "MINOR", "DRAFT", null, null, 7, null);
        item(Z, "1.001", 1, "FILLER", null, null, 7, 0, 7);

        // M1 — H(1)·G(2), 재정의 B9
        message(M1, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", OPEN, 20, H, G);
        konst(M1, "1.000", H, "SND_FAC_TP", "B9");
        // M2 — G(1)·H(2), 미래 minor 1.001 은 G v2 시작과 같은 시각, DRAFT 2.000 은 H 만
        message(M2, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", "2026-09-01 00:00:00", 30, G, H);
        message(M2, "1.001", "MINOR", "RELEASED", "2026-09-01 00:00:00", OPEN, 30, G, H);
        message(M2, "2.000", "MAJOR", "DRAFT", null, null, 40, H);
        konst(M2, "2.000", H, "SND_FAC_TP", "B7");
        // M3 — 1.000 은 판정 시각에 닫힌다(제외), 2.000 은 판정 시각부터
        message(M3, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", "2026-08-01 00:00:00", 11, H);
        message(M3, "2.000", "MAJOR", "RELEASED", "2026-08-01 00:00:00", OPEN, 12, H);
        // M4 — 판정 시각 1초 뒤 닫힌다(포함), 총 길이 14 + 980 = 994
        message(M4, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", "2026-08-01 00:00:01", 980, H);
        // M5 — 대상 헤더를 안 쓴다
        message(M5, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", OPEN, 9, N);
        // M6 — U 에 RELEASED 가 없어 전후 합성 실패
        message(M6, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", OPEN, 7, H, U);
        // M7 — 총 길이 1004(LEN3 이 이미 못 담는다), 재정의 TOOLONG(4자리 칸을 이미 넘는다)
        message(M7, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", OPEN, 990, H);
        konst(M7, "1.000", H, "SND_FAC_TP", "TOOLONG");
        // M8 — LEGACY 스냅샷 버전(적층 행이 있어도 제외)
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, OWN_LENGTH, SNAPSHOT_JSON, "
                + "LEGACY_SNAPSHOT_YN) VALUES (?, 0.500, 'MAJOR', 'RELEASED', '2025-01-01 00:00:00', ?, 0, '{}', 'Y')", M8, OPEN);
        stack(M8, "0.500", 1, H);
        // M9 — F 를 쌓은 DRAFT 전문
        message(M9, "1.000", "MAJOR", "DRAFT", null, null, 8, F);
    }

    @AfterEach
    void tearDown() {
        probe.stop();
    }

    // ------------------------------------------------------------------ 시나리오

    /** DRAFT 가 v2 와 같다 — 길이 전후 같고 새 오류 없음. 이미 있던 L16·L12(M7)는 경고로 낮춰진다. */
    @Test
    void unchangedDraft() {
        hDraft("HIX1", 14);
        hV2Items(H, DRAFT.toPlainString());
        assertImpact("unchanged", H, DRAFT, AUG1, """
                ROW {LAYOUT_ID=9311, LAYOUT_NAME=M1, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=39, TOTAL_LENGTH_AFTER=39, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=49, TOTAL_LENGTH_AFTER=49, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.001, STATE=FUTURE, EVALUATED_AT=2026-09-01 00:00:00, TOTAL_LENGTH_BEFORE=52, TOTAL_LENGTH_AFTER=52, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=2.000, STATE=DRAFT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=54, TOTAL_LENGTH_AFTER=54, ISSUES=}
                ROW {LAYOUT_ID=9313, LAYOUT_NAME=M3, SND_RCV=null → null, VER=2.000, STATE=FUTURE, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=26, TOTAL_LENGTH_AFTER=26, ISSUES=}
                ROW {LAYOUT_ID=9314, LAYOUT_NAME=M4, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=994, TOTAL_LENGTH_AFTER=994, ISSUES=}
                ROW {LAYOUT_ID=9316, LAYOUT_NAME=M6, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=null, TOTAL_LENGTH_AFTER=null, ISSUES=헤더 저장 거부: L09 헤더 9303 에 시각 2026-08-01 00:00:00 에 확정된 버전이 없습니다}
                ROW {LAYOUT_ID=9317, LAYOUT_NAME=M7, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=1004, TOTAL_LENGTH_AFTER=1004, ISSUES=이미 있던 문제(이 헤더 확정 전에도 같음) — 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1004 를 담지 못합니다 / 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=TOOLONG 가 새 항목 길이 4 를 넘습니다}
                WARN HEADER_UNRESOLVED | 전문 M6 v1.000: 헤더 저장 거부: L09 헤더 9303 에 시각 2026-08-01 00:00:00 에 확정된 버전이 없습니다 | HEADER_LAYOUT_ID | 9316@1.000
                WARN L16 | 전문 M7 v1.000: 이미 있던 문제(이 헤더 확정 전에도 같음) — 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1004 를 담지 못합니다 | LENGTH | 9317@1.000
                WARN L12 | 전문 M7 v1.000: 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=TOOLONG 가 새 항목 길이 4 를 넘습니다 | CONST_VALUE | 9317@1.000
                EAIS [HIX1]
                """);
    }

    /** 항목 추가(끝에 EXTRA_3 3자리) + EAI 를 HIX2 로 바꾼다(G 의 표준 헤더 주장을 넘겨받기). */
    @Test
    void addedItemAndEaiTakeover() {
        hDraft("HIX2", 17);
        hV2Items(H, DRAFT.toPlainString());
        item(H, DRAFT.toPlainString(), 4, "CONST", "EXTRA_3", "XYZ", null, 14, 3);
        assertImpact("added", H, DRAFT, AUG1, """
                ROW {LAYOUT_ID=9311, LAYOUT_NAME=M1, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=39, TOTAL_LENGTH_AFTER=42, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=49, TOTAL_LENGTH_AFTER=52, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.001, STATE=FUTURE, EVALUATED_AT=2026-09-01 00:00:00, TOTAL_LENGTH_BEFORE=52, TOTAL_LENGTH_AFTER=55, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=2.000, STATE=DRAFT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=54, TOTAL_LENGTH_AFTER=57, ISSUES=}
                ROW {LAYOUT_ID=9313, LAYOUT_NAME=M3, SND_RCV=null → null, VER=2.000, STATE=FUTURE, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=26, TOTAL_LENGTH_AFTER=29, ISSUES=}
                ROW {LAYOUT_ID=9314, LAYOUT_NAME=M4, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=994, TOTAL_LENGTH_AFTER=997, ISSUES=}
                ROW {LAYOUT_ID=9316, LAYOUT_NAME=M6, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=null, TOTAL_LENGTH_AFTER=null, ISSUES=헤더 저장 거부: L09 헤더 9303 에 시각 2026-08-01 00:00:00 에 확정된 버전이 없습니다}
                ROW {LAYOUT_ID=9317, LAYOUT_NAME=M7, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=1004, TOTAL_LENGTH_AFTER=1007, ISSUES=이미 있던 문제(이 헤더 확정 전에도 같음) — 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1007 를 담지 못합니다 / 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=TOOLONG 가 새 항목 길이 4 를 넘습니다}
                WARN HEADER_UNRESOLVED | 전문 M6 v1.000: 헤더 저장 거부: L09 헤더 9303 에 시각 2026-08-01 00:00:00 에 확정된 버전이 없습니다 | HEADER_LAYOUT_ID | 9316@1.000
                WARN L16 | 전문 M7 v1.000: 이미 있던 문제(이 헤더 확정 전에도 같음) — 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1007 를 담지 못합니다 | LENGTH | 9317@1.000
                WARN L12 | 전문 M7 v1.000: 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=TOOLONG 가 새 항목 길이 4 를 넘습니다 | CONST_VALUE | 9317@1.000
                WARN EAI_STANDARD_HEADER_SWITCH | EAI 표준 헤더 전환 — EAI HIX1 의 표준 헤더가 2026-08-01 00:00:00 부터 HA(9301) → 없음 로 바뀝니다(이 헤더가 내려놓습니다). 그 뒤 저장하는 전문은 새 표준 헤더를 맨 앞에 쌓습니다(이미 저장된 전문의 적층은 그대로) | EAI_CODE | HIX1
                WARN EAI_STANDARD_HEADER_SWITCH | EAI 표준 헤더 전환 — EAI HIX2 의 표준 헤더가 2026-08-01 00:00:00 부터 HB(9302) → HA(9301) 로 바뀝니다(이 헤더가 넘겨받습니다). 그 뒤 저장하는 전문은 새 표준 헤더를 맨 앞에 쌓습니다(이미 저장된 전문의 적층은 그대로) | EAI_CODE | HIX2
                EAIS [HIX2]
                """);
    }

    /**
     * 항목 삭제(SND_FAC_TP CONST 를 뺀다) — 재정의가 있는 전문마다 ORPHAN_OVERRIDE. LEN3 이 SEQ 2→1 로 옮겨 M7 의 L16 은 "전" 과 같은 칸으로
     * 보지 않아 오류다(l16Cell 이 항목 순번을 정체에 넣는 지금 동작 그대로 고정).
     */
    @Test
    void removedItemOrphansOverrides() {
        hDraft("HIX1", 10);
        item(H, DRAFT.toPlainString(), 1, "AUTO", "LEN3", "MSG_LENGTH", null, 0, 3);
        item(H, DRAFT.toPlainString(), 2, "FILLER", null, null, 7, 3, 7);
        assertImpact("removed", H, DRAFT, AUG1, """
                ROW {LAYOUT_ID=9311, LAYOUT_NAME=M1, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=39, TOTAL_LENGTH_AFTER=35, ISSUES=전문 M1 v1.000: 재정의 SND_FAC_TP=B9 이(가) 적용되지 않습니다(새 헤더 버전에 그 CONST 항목이 없다 — 헤더 기본값으로 나간다)}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=49, TOTAL_LENGTH_AFTER=45, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.001, STATE=FUTURE, EVALUATED_AT=2026-09-01 00:00:00, TOTAL_LENGTH_BEFORE=52, TOTAL_LENGTH_AFTER=48, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=2.000, STATE=DRAFT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=54, TOTAL_LENGTH_AFTER=50, ISSUES=전문 M2 v2.000: 재정의 SND_FAC_TP=B7 이(가) 적용되지 않습니다(새 헤더 버전에 그 CONST 항목이 없다 — 헤더 기본값으로 나간다)}
                ROW {LAYOUT_ID=9313, LAYOUT_NAME=M3, SND_RCV=null → null, VER=2.000, STATE=FUTURE, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=26, TOTAL_LENGTH_AFTER=22, ISSUES=}
                ROW {LAYOUT_ID=9314, LAYOUT_NAME=M4, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=994, TOTAL_LENGTH_AFTER=990, ISSUES=}
                ROW {LAYOUT_ID=9316, LAYOUT_NAME=M6, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=null, TOTAL_LENGTH_AFTER=null, ISSUES=헤더 저장 거부: L09 헤더 9303 에 시각 2026-08-01 00:00:00 에 확정된 버전이 없습니다}
                ROW {LAYOUT_ID=9317, LAYOUT_NAME=M7, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=1004, TOTAL_LENGTH_AFTER=1000, ISSUES=헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1000 를 담지 못합니다 / 전문 M7 v1.000: 재정의 SND_FAC_TP=TOOLONG 이(가) 적용되지 않습니다(새 헤더 버전에 그 CONST 항목이 없다 — 헤더 기본값으로 나간다)}
                ERROR L16 | 전문 M7 v1.000: 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1000 를 담지 못합니다 | LENGTH | 9317@1.000
                WARN ORPHAN_OVERRIDE | 전문 M1 v1.000: 재정의 SND_FAC_TP=B9 이(가) 적용되지 않습니다(새 헤더 버전에 그 CONST 항목이 없다 — 헤더 기본값으로 나간다) | HEADER_COLUMN_PHYS | 9311@1.000
                WARN ORPHAN_OVERRIDE | 전문 M2 v2.000: 재정의 SND_FAC_TP=B7 이(가) 적용되지 않습니다(새 헤더 버전에 그 CONST 항목이 없다 — 헤더 기본값으로 나간다) | HEADER_COLUMN_PHYS | 9312@2.000
                WARN HEADER_UNRESOLVED | 전문 M6 v1.000: 헤더 저장 거부: L09 헤더 9303 에 시각 2026-08-01 00:00:00 에 확정된 버전이 없습니다 | HEADER_LAYOUT_ID | 9316@1.000
                WARN ORPHAN_OVERRIDE | 전문 M7 v1.000: 재정의 SND_FAC_TP=TOOLONG 이(가) 적용되지 않습니다(새 헤더 버전에 그 CONST 항목이 없다 — 헤더 기본값으로 나간다) | HEADER_COLUMN_PHYS | 9317@1.000
                EAIS [HIX1]
                """);
    }

    /** 항목 변경 — SND_FAC_TP 4→1자리(B9 는 새 L12, TOOLONG 은 이미 있던 L12), 여분 7→16(M4 994→1000 새 L16, M7 은 이미 있던 L16). */
    @Test
    void changedItemNewAndKnownL16L12() {
        hDraft("HIX1", 20);
        item(H, DRAFT.toPlainString(), 1, "CONST", "SND_FAC_TP", "B", null, 0, 1);
        item(H, DRAFT.toPlainString(), 2, "AUTO", "LEN3", "MSG_LENGTH", null, 1, 3);
        item(H, DRAFT.toPlainString(), 3, "FILLER", null, null, 16, 4, 16);
        assertImpact("changed", H, DRAFT, AUG1, """
                ROW {LAYOUT_ID=9311, LAYOUT_NAME=M1, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=39, TOTAL_LENGTH_AFTER=45, ISSUES=재정의 SND_FAC_TP=B9 가 새 항목 길이 1 를 넘습니다}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=49, TOTAL_LENGTH_AFTER=55, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.001, STATE=FUTURE, EVALUATED_AT=2026-09-01 00:00:00, TOTAL_LENGTH_BEFORE=52, TOTAL_LENGTH_AFTER=58, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=2.000, STATE=DRAFT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=54, TOTAL_LENGTH_AFTER=60, ISSUES=재정의 SND_FAC_TP=B7 가 새 항목 길이 1 를 넘습니다}
                ROW {LAYOUT_ID=9313, LAYOUT_NAME=M3, SND_RCV=null → null, VER=2.000, STATE=FUTURE, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=26, TOTAL_LENGTH_AFTER=32, ISSUES=}
                ROW {LAYOUT_ID=9314, LAYOUT_NAME=M4, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=994, TOTAL_LENGTH_AFTER=1000, ISSUES=헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1000 를 담지 못합니다}
                ROW {LAYOUT_ID=9316, LAYOUT_NAME=M6, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=null, TOTAL_LENGTH_AFTER=null, ISSUES=헤더 저장 거부: L09 헤더 9303 에 시각 2026-08-01 00:00:00 에 확정된 버전이 없습니다}
                ROW {LAYOUT_ID=9317, LAYOUT_NAME=M7, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=1004, TOTAL_LENGTH_AFTER=1010, ISSUES=이미 있던 문제(이 헤더 확정 전에도 같음) — 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1010 를 담지 못합니다 / 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=TOOLONG 가 새 항목 길이 1 를 넘습니다}
                ERROR L12 | 전문 M1 v1.000: 재정의 SND_FAC_TP=B9 가 새 항목 길이 1 를 넘습니다 | CONST_VALUE | 9311@1.000
                ERROR L12 | 전문 M2 v2.000: 재정의 SND_FAC_TP=B7 가 새 항목 길이 1 를 넘습니다 | CONST_VALUE | 9312@2.000
                ERROR L16 | 전문 M4 v1.000: 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1000 를 담지 못합니다 | LENGTH | 9314@1.000
                WARN HEADER_UNRESOLVED | 전문 M6 v1.000: 헤더 저장 거부: L09 헤더 9303 에 시각 2026-08-01 00:00:00 에 확정된 버전이 없습니다 | HEADER_LAYOUT_ID | 9316@1.000
                WARN L16 | 전문 M7 v1.000: 이미 있던 문제(이 헤더 확정 전에도 같음) — 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1010 를 담지 못합니다 | LENGTH | 9317@1.000
                WARN L12 | 전문 M7 v1.000: 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=TOOLONG 가 새 항목 길이 1 를 넘습니다 | CONST_VALUE | 9317@1.000
                EAIS [HIX1]
                """);
    }

    /**
     * 판정 시각이 H v2 시작과 같으면 "전" 은 v2, 1초 전이면 v1(LEN3 이 없어 M7 의 L16 이 새로 생긴 오류) — 같은 DRAFT 로 두 시각을 본다.
     * 07-01 에는 M3 1.000(08-01 에 닫힘)도 들어온다.
     */
    @Test
    void ownHeaderBoundaryAtApplyFrom() {
        hDraft("HIX1", 14);
        hV2Items(H, DRAFT.toPlainString());
        assertImpact("boundary-at", H, DRAFT, LocalDateTime.of(2026, 7, 1, 0, 0, 0), """
                ROW {LAYOUT_ID=9311, LAYOUT_NAME=M1, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-07-01 00:00:00, TOTAL_LENGTH_BEFORE=39, TOTAL_LENGTH_AFTER=39, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-07-01 00:00:00, TOTAL_LENGTH_BEFORE=49, TOTAL_LENGTH_AFTER=49, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.001, STATE=FUTURE, EVALUATED_AT=2026-09-01 00:00:00, TOTAL_LENGTH_BEFORE=52, TOTAL_LENGTH_AFTER=52, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=2.000, STATE=DRAFT, EVALUATED_AT=2026-07-01 00:00:00, TOTAL_LENGTH_BEFORE=54, TOTAL_LENGTH_AFTER=54, ISSUES=}
                ROW {LAYOUT_ID=9313, LAYOUT_NAME=M3, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-07-01 00:00:00, TOTAL_LENGTH_BEFORE=25, TOTAL_LENGTH_AFTER=25, ISSUES=}
                ROW {LAYOUT_ID=9313, LAYOUT_NAME=M3, SND_RCV=null → null, VER=2.000, STATE=FUTURE, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=26, TOTAL_LENGTH_AFTER=26, ISSUES=}
                ROW {LAYOUT_ID=9314, LAYOUT_NAME=M4, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-07-01 00:00:00, TOTAL_LENGTH_BEFORE=994, TOTAL_LENGTH_AFTER=994, ISSUES=}
                ROW {LAYOUT_ID=9316, LAYOUT_NAME=M6, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-07-01 00:00:00, TOTAL_LENGTH_BEFORE=null, TOTAL_LENGTH_AFTER=null, ISSUES=헤더 저장 거부: L09 헤더 9303 에 시각 2026-07-01 00:00:00 에 확정된 버전이 없습니다}
                ROW {LAYOUT_ID=9317, LAYOUT_NAME=M7, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-07-01 00:00:00, TOTAL_LENGTH_BEFORE=1004, TOTAL_LENGTH_AFTER=1004, ISSUES=이미 있던 문제(이 헤더 확정 전에도 같음) — 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1004 를 담지 못합니다 / 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=TOOLONG 가 새 항목 길이 4 를 넘습니다}
                WARN HEADER_UNRESOLVED | 전문 M6 v1.000: 헤더 저장 거부: L09 헤더 9303 에 시각 2026-07-01 00:00:00 에 확정된 버전이 없습니다 | HEADER_LAYOUT_ID | 9316@1.000
                WARN L16 | 전문 M7 v1.000: 이미 있던 문제(이 헤더 확정 전에도 같음) — 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1004 를 담지 못합니다 | LENGTH | 9317@1.000
                WARN L12 | 전문 M7 v1.000: 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=TOOLONG 가 새 항목 길이 4 를 넘습니다 | CONST_VALUE | 9317@1.000
                EAIS [HIX1]
                """);
        assertImpact("boundary-before", H, DRAFT, LocalDateTime.of(2026, 6, 30, 23, 59, 59), """
                ROW {LAYOUT_ID=9311, LAYOUT_NAME=M1, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-06-30 23:59:59, TOTAL_LENGTH_BEFORE=35, TOTAL_LENGTH_AFTER=39, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-06-30 23:59:59, TOTAL_LENGTH_BEFORE=45, TOTAL_LENGTH_AFTER=49, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.001, STATE=FUTURE, EVALUATED_AT=2026-09-01 00:00:00, TOTAL_LENGTH_BEFORE=52, TOTAL_LENGTH_AFTER=52, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=2.000, STATE=DRAFT, EVALUATED_AT=2026-06-30 23:59:59, TOTAL_LENGTH_BEFORE=50, TOTAL_LENGTH_AFTER=54, ISSUES=}
                ROW {LAYOUT_ID=9313, LAYOUT_NAME=M3, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-06-30 23:59:59, TOTAL_LENGTH_BEFORE=21, TOTAL_LENGTH_AFTER=25, ISSUES=}
                ROW {LAYOUT_ID=9313, LAYOUT_NAME=M3, SND_RCV=null → null, VER=2.000, STATE=FUTURE, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=26, TOTAL_LENGTH_AFTER=26, ISSUES=}
                ROW {LAYOUT_ID=9314, LAYOUT_NAME=M4, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-06-30 23:59:59, TOTAL_LENGTH_BEFORE=990, TOTAL_LENGTH_AFTER=994, ISSUES=}
                ROW {LAYOUT_ID=9316, LAYOUT_NAME=M6, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-06-30 23:59:59, TOTAL_LENGTH_BEFORE=null, TOTAL_LENGTH_AFTER=null, ISSUES=헤더 저장 거부: L09 헤더 9303 에 시각 2026-06-30 23:59:59 에 확정된 버전이 없습니다}
                ROW {LAYOUT_ID=9317, LAYOUT_NAME=M7, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-06-30 23:59:59, TOTAL_LENGTH_BEFORE=1000, TOTAL_LENGTH_AFTER=1004, ISSUES=헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1004 를 담지 못합니다 / 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=TOOLONG 가 새 항목 길이 4 를 넘습니다}
                ERROR L16 | 전문 M7 v1.000: 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1004 를 담지 못합니다 | LENGTH | 9317@1.000
                WARN HEADER_UNRESOLVED | 전문 M6 v1.000: 헤더 저장 거부: L09 헤더 9303 에 시각 2026-06-30 23:59:59 에 확정된 버전이 없습니다 | HEADER_LAYOUT_ID | 9316@1.000
                WARN L12 | 전문 M7 v1.000: 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=TOOLONG 가 새 항목 길이 4 를 넘습니다 | CONST_VALUE | 9317@1.000
                EAIS [HIX1]
                """);
    }

    /** 첫 확정 헤더 — "전" 합성 실패(그 시각 RELEASED 없음)라 전 길이가 비고, 쌓은 전문은 DRAFT 하나. */
    @Test
    void firstConfirmHasNoBefore() {
        assertImpact("first-confirm", F, new BigDecimal("1.000"), AUG1, """
                ROW {LAYOUT_ID=9319, LAYOUT_NAME=M9, SND_RCV=null → null, VER=1.000, STATE=DRAFT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=null, TOTAL_LENGTH_AFTER=14, ISSUES=}
                EAIS []
                """);
    }

    /** 아무도 안 쓰는 헤더 — 영향 행이 없다. */
    @Test
    void unusedHeaderHasNoRows() {
        assertImpact("unused", Z, new BigDecimal("1.001"), AUG1, """
                EAIS []
                """);
    }

    /**
     * 같은 트랜잭션 안에서 flush 전에 바꾼 JPA 엔티티가 결과에 보인다. 관리 엔티티 수정 — DRAFT 의 SND_FAC_TP 4→1자리(M1 B9·M2 B7 새 L12
     * 오류), 여분 7→17, OWN_LENGTH 14→27(총 길이 +13). persist — DRAFT 에 SEQ 4 LEN3 MSG_LENGTH 칸 추가("전" 에 없던 칸이라 M4·M7 에
     * 새 L16 오류), M5 가 H 를 2번째로 쌓고 재정의 Q1234("전"·"후" 합성 모두에 보여 이미 있던 L12 경고). 묶음 조회가 네이티브 SQL·JDBC 로
     * 바뀌어 자동 flush 를 건너뛰면 이 경우가 깨진다.
     */
    @Test
    void unflushedWritesInSameTransactionAreVisible() {
        hDraft("HIX1", 14);
        hV2Items(H, DRAFT.toPlainString());
        QueryCountProbe.Measured<LayoutHeaderImpact.Result> m = probe.measureInTx("same-tx", () -> {
            for (MdmLayoutItem i : queries.itemsOf(H, DRAFT)) {
                if ("FILLER".equals(i.getFillKind())) {
                    i.setFillerLength(17);
                    i.setLength(17);
                } else if ("SND_FAC_TP".equals(i.getColumnPhys())) {
                    i.setLength(1);
                }
            }
            store.find(H, DRAFT).orElseThrow().setOwnLength(27);
            MdmLayoutItem extra = new MdmLayoutItem(H, DRAFT, 4, "AUTO");
            extra.setColumnPhys("LEN3");
            extra.setDefaultValue("MSG_LENGTH");
            extra.setOffset(24);
            extra.setLength(3);
            em.persist(extra);
            em.persist(new MdmLayoutHeader(M5, new BigDecimal("1.000"), 2, H));
            em.persist(new MdmLayoutConst(M5, new BigDecimal("1.000"), H, "SND_FAC_TP", "Q1234"));
            return impact.evaluate(H, DRAFT, AUG1);
        });
        assertThat(render(m.result())).isEqualTo("""
                ROW {LAYOUT_ID=9311, LAYOUT_NAME=M1, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=39, TOTAL_LENGTH_AFTER=52, ISSUES=재정의 SND_FAC_TP=B9 가 새 항목 길이 1 를 넘습니다}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=49, TOTAL_LENGTH_AFTER=62, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=1.001, STATE=FUTURE, EVALUATED_AT=2026-09-01 00:00:00, TOTAL_LENGTH_BEFORE=52, TOTAL_LENGTH_AFTER=65, ISSUES=}
                ROW {LAYOUT_ID=9312, LAYOUT_NAME=M2, SND_RCV=null → null, VER=2.000, STATE=DRAFT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=54, TOTAL_LENGTH_AFTER=67, ISSUES=재정의 SND_FAC_TP=B7 가 새 항목 길이 1 를 넘습니다}
                ROW {LAYOUT_ID=9313, LAYOUT_NAME=M3, SND_RCV=null → null, VER=2.000, STATE=FUTURE, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=26, TOTAL_LENGTH_AFTER=39, ISSUES=}
                ROW {LAYOUT_ID=9314, LAYOUT_NAME=M4, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=994, TOTAL_LENGTH_AFTER=1007, ISSUES=헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1007 를 담지 못합니다 / 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1007 를 담지 못합니다}
                ROW {LAYOUT_ID=9315, LAYOUT_NAME=M5, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=26, TOTAL_LENGTH_AFTER=39, ISSUES=이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=Q1234 가 새 항목 길이 1 를 넘습니다}
                ROW {LAYOUT_ID=9316, LAYOUT_NAME=M6, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=null, TOTAL_LENGTH_AFTER=null, ISSUES=헤더 저장 거부: L09 헤더 9303 에 시각 2026-08-01 00:00:00 에 확정된 버전이 없습니다}
                ROW {LAYOUT_ID=9317, LAYOUT_NAME=M7, SND_RCV=null → null, VER=1.000, STATE=CURRENT, EVALUATED_AT=2026-08-01 00:00:00, TOTAL_LENGTH_BEFORE=1004, TOTAL_LENGTH_AFTER=1017, ISSUES=이미 있던 문제(이 헤더 확정 전에도 같음) — 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1017 를 담지 못합니다 / 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1017 를 담지 못합니다 / 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=TOOLONG 가 새 항목 길이 1 를 넘습니다}
                ERROR L12 | 전문 M1 v1.000: 재정의 SND_FAC_TP=B9 가 새 항목 길이 1 를 넘습니다 | CONST_VALUE | 9311@1.000
                ERROR L12 | 전문 M2 v2.000: 재정의 SND_FAC_TP=B7 가 새 항목 길이 1 를 넘습니다 | CONST_VALUE | 9312@2.000
                ERROR L16 | 전문 M4 v1.000: 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1007 를 담지 못합니다 | LENGTH | 9314@1.000
                ERROR L16 | 전문 M4 v1.000: 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1007 를 담지 못합니다 | LENGTH | 9314@1.000
                ERROR L16 | 전문 M7 v1.000: 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1017 를 담지 못합니다 | LENGTH | 9317@1.000
                WARN L12 | 전문 M5 v1.000: 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=Q1234 가 새 항목 길이 1 를 넘습니다 | CONST_VALUE | 9315@1.000
                WARN HEADER_UNRESOLVED | 전문 M6 v1.000: 헤더 저장 거부: L09 헤더 9303 에 시각 2026-08-01 00:00:00 에 확정된 버전이 없습니다 | HEADER_LAYOUT_ID | 9316@1.000
                WARN L16 | 전문 M7 v1.000: 이미 있던 문제(이 헤더 확정 전에도 같음) — 헤더 HA 전문 길이 칸(LEN3, 3자리)이 총 길이 1017 를 담지 못합니다 | LENGTH | 9317@1.000
                WARN L12 | 전문 M7 v1.000: 이미 있던 문제(이 헤더 확정 전에도 같음) — 재정의 SND_FAC_TP=TOOLONG 가 새 항목 길이 1 를 넘습니다 | CONST_VALUE | 9317@1.000
                EAIS [HIX1]
                """);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID = ?", Integer.class, M5))
                .as("트랜잭션은 롤백된다").isEqualTo(1);
    }

    // ------------------------------------------------------------------ 비교

    private void assertImpact(String name, long headerId, BigDecimal draftVer, LocalDateTime applyFrom, String expected) {
        QueryCountProbe.Measured<LayoutHeaderImpact.Result> m = probe.measureInTx(name,
                () -> impact.evaluate(headerId, draftVer, applyFrom));
        assertThat(render(m.result())).as(name).isEqualTo(expected);
    }

    /** Result 전체를 비교용 글로 — 행은 (LAYOUT_ID, VER) 순, 오류·경고는 itemKey 순(안정 정렬). */
    static String render(LayoutHeaderImpact.Result r) {
        StringBuilder sb = new StringBuilder();
        List<Map<String, Object>> rows = new ArrayList<>(r.rows());
        rows.sort(Comparator.comparing((Map<String, Object> x) -> ((Number) x.get("LAYOUT_ID")).longValue())
                .thenComparing(x -> new BigDecimal((String) x.get("VER"))));
        for (Map<String, Object> row : rows) {
            sb.append("ROW ").append(row).append('\n');
        }
        issues(sb, "ERROR", r.errors());
        issues(sb, "WARN", r.warnings());
        sb.append("EAIS ").append(r.eaiCodes()).append('\n');
        return sb.toString();
    }

    private static void issues(StringBuilder sb, String tag, List<MdmCheckIssue> list) {
        List<MdmCheckIssue> sorted = new ArrayList<>(list);
        sorted.sort(Comparator.comparing(i -> String.valueOf(i.itemKey())));
        for (MdmCheckIssue i : sorted) {
            sb.append(tag).append(' ').append(i.code()).append(" | ").append(i.message()).append(" | ").append(i.field())
                    .append(" | ").append(i.itemKey()).append('\n');
        }
    }

    // ------------------------------------------------------------------ 시드

    private void hDraft(String eai, int own) {
        ver(H, DRAFT.toPlainString(), "MINOR", "DRAFT", null, null, own, eai);
    }

    /** H v2 항목 — SND_FAC_TP(4)·LEN3 MSG_LENGTH(3)·여분 7 = 14. */
    private void hV2Items(long id, String ver) {
        item(id, ver, 1, "CONST", "SND_FAC_TP", "B0", null, 0, 4);
        item(id, ver, 2, "AUTO", "LEN3", "MSG_LENGTH", null, 4, 3);
        item(id, ver, 3, "FILLER", null, null, 7, 7, 7);
    }

    private void layout(long id, String kind, String name) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES (?, ?, ?, 'INUSE', 0)", id, kind, name);
    }

    private void ver(long id, String ver, String kind, String status, String from, String to, int own, String eai) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, OWN_LENGTH, EAI_CODE) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, new BigDecimal(ver), kind, status, "DRAFT".equals(status) ? "kim" : null,
                from, to, own, eai);
    }

    /** 전문 버전 — 본문은 여분 하나(own), 헤더는 주어진 순서로 쌓는다. */
    private void message(long id, String ver, String kind, String status, String from, String to, int own, long... headers) {
        ver(id, ver, kind, status, from, to, own, null);
        item(id, ver, 1, "FILLER", null, null, own, 0, own);
        for (int i = 0; i < headers.length; i++) {
            stack(id, ver, i + 1, headers[i]);
        }
    }

    private void stack(long id, String ver, int seq, long header) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (?, ?, ?, ?)", id, new BigDecimal(ver),
                seq, header);
    }

    private void konst(long id, String ver, long header, String phys, String value) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_CONST (LAYOUT_ID, VER, HEADER_LAYOUT_ID, HEADER_COLUMN_PHYS, CONST_VALUE) VALUES (?, ?, ?, ?, ?)",
                id, new BigDecimal(ver), header, phys, value);
    }

    private void item(long id, String ver, int seq, String kind, String phys, String dflt, Integer filler, int offset, int length) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, COLUMN_PHYS, DEFAULT_VALUE, FILLER_LENGTH, `OFFSET`, `LENGTH`) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, new BigDecimal(ver), seq, kind, phys, dflt, filler, offset, length);
    }
}
