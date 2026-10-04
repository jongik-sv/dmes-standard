package com.dongkuk.dmes.mdm.measure;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.dmb.LayoutTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.confirm.LayoutHeaderImpact;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * P2 — 헤더 확정 영향도({@link LayoutHeaderImpact#evaluate}) 쿼리 수(결정적)를 전문 버전 수 E·쌓인 헤더 수 H 를 바꿔 가며 잰다.
 * perf-mdm-backend.md P2 의 "E·H 를 바꿔 볼 때" 절차. 고정 5시나리오 값은 동치 시험 {@code LayoutHeaderImpactEquivalenceSqliteTest}
 * ({@code [query-count] headerImpact …}, 스크립트가 {@code MEASURE P2 equiv-…} 로 바꾼다)가 낸다.
 *
 * <p>데이터 준비는 동치 시험을 본뜬다(JDBC 직접 INSERT, {@link LayoutTestSupport#dictionary()} 사전, 범위 삭제). 대상 헤더 HA 는 RELEASED 1.000
 * (SND_FAC_TP 4 + 여분 6 = 10) 과 DRAFT 1.001(SND_FAC_TP 4 + 여분 8 = 12, 길이가 바뀌어 모든 전문이 영향받음). 다른 헤더 H−1 개는 RELEASED
 * 1.000(LINE_CODE 2 + 여분 3). 전문 E 개는 각각 RELEASED 1.000 한 버전에 HA(1번째)·다른 헤더(2..H번째)를 쌓고, 짝수 번째 전문은 HA 의
 * SND_FAC_TP 재정의를 가진다. 판정 시각 2026-08-01. 영향 행 수({@code rows})가 E 와 같아야 정상 경로다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class MeasureP2HeaderImpactTest extends LayoutTestSupport {

    private static final String P = "P2";
    static final long HA = 9501;            // 대상 헤더
    static final long OTHER0 = 9510;        // 다른 헤더는 9510 부터
    static final long MSG0 = 9600;          // 전문은 9601 부터
    static final String OPEN = "9999-12-31 00:00:00";
    static final BigDecimal DRAFT = new BigDecimal("1.001");
    static final LocalDateTime AUG1 = LocalDateTime.of(2026, 8, 1, 0, 0, 0);

    @Autowired
    LayoutHeaderImpact impact;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    PlatformTransactionManager tm;
    @Autowired
    EntityManager em;
    @Autowired
    EntityManagerFactory emf;

    @Test
    void 헤더_확정_영향도_쿼리_수_E_H_단계() {
        MeasureSupport.assumeEnabled();
        currentUser.set("kim", STEWARD);
        StatProbe probe = new StatProbe(tm, em, emf);
        MeasureSupport.env(P);
        dictionary();
        List<String> problems = new ArrayList<>();
        int[] es = MeasureSupport.dry() ? new int[] {1, 2} : new int[] {1, 4, 16, 64};
        int[] hs = MeasureSupport.dry() ? new int[] {1, 2} : new int[] {1, 3, 5};
        for (int h : hs) {
            for (int e : es) {
                seed(e, h);
                StatProbe.Counts k = probe.inTx(() -> impact.evaluate(HA, DRAFT, AUG1));
                String scenario = "E" + e + "-H" + h;
                int rows = k.result() instanceof LayoutHeaderImpact.Result r ? r.rows().size() : -1;
                if (k.error() != null || rows != e) {
                    problems.add(scenario + " rows=" + rows + " error=" + k.error());
                }
                MeasureSupport.emit(P, scenario, MeasureSupport.concat(new Object[] {"E", e, "H", h, "rows", rows}, k.kv()));
            }
        }
        assertTrue(problems.isEmpty(), "정상 경로가 아니다: " + problems);
    }

    private void seed(int e, int h) {
        String range = " WHERE LAYOUT_ID BETWEEN 9500 AND 9699";
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_CONST" + range);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_HEADER" + range);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_ITEM" + range);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT_VER" + range);
        jdbc.update("DELETE FROM TB_MDM_LAYOUT" + range);
        jdbc.update("DELETE FROM TB_MDM_EAI WHERE EAI_CODE = 'MSRX1'");
        jdbc.update("INSERT INTO TB_MDM_EAI (EAI_CODE, EAI_NAME, ENCODING) VALUES ('MSRX1', '측정 EAI', 'UTF-8')");

        layout(HA, "HEADER", "MHA");
        ver(HA, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", OPEN, 10, "MSRX1");
        item(HA, "1.000", 1, "CONST", "SND_FAC_TP", "B0", null, 0, 4);
        item(HA, "1.000", 2, "FILLER", null, null, 6, 4, 6);
        ver(HA, DRAFT.toPlainString(), "MINOR", "DRAFT", null, null, 12, "MSRX1");
        item(HA, DRAFT.toPlainString(), 1, "CONST", "SND_FAC_TP", "B0", null, 0, 4);
        item(HA, DRAFT.toPlainString(), 2, "FILLER", null, null, 8, 4, 8);
        long[] others = new long[h - 1];
        for (int i = 0; i < others.length; i++) {
            long id = OTHER0 + i;
            others[i] = id;
            layout(id, "HEADER", "MH" + id);
            ver(id, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", OPEN, 5, null);
            item(id, "1.000", 1, "CONST", "LINE_CODE", "B1", null, 0, 2);
            item(id, "1.000", 2, "FILLER", null, null, 3, 2, 3);
        }
        for (int i = 1; i <= e; i++) {
            long m = MSG0 + i;
            layout(m, "MESSAGE", "MM" + i);
            ver(m, "1.000", "MAJOR", "RELEASED", "2026-01-01 00:00:00", OPEN, 20, null);
            item(m, "1.000", 1, "FILLER", null, null, 20, 0, 20);
            stack(m, "1.000", 1, HA);
            for (int j = 0; j < others.length; j++) {
                stack(m, "1.000", j + 2, others[j]);
            }
            if (i % 2 == 0) {
                konst(m, "1.000", HA, "SND_FAC_TP", "B9");
            }
        }
    }

    // 아래 도우미는 LayoutHeaderImpactEquivalenceSqliteTest(dev, ea1955c5) 와 같은 INSERT 다.

    private void layout(long id, String kind, String name) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES (?, ?, ?, 'INUSE', 0)", id, kind,
                name);
    }

    private void ver(long id, String ver, String kind, String status, String from, String to, int own, String eai) {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, OWN_LENGTH, EAI_CODE) "
                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, new BigDecimal(ver), kind, status, "DRAFT".equals(status) ? "kim" : null,
                from, to, own, eai);
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
