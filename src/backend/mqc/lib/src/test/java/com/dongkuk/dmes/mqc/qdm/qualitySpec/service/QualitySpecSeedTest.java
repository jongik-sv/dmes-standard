package com.dongkuk.dmes.mqc.qdm.qualitySpec.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mqc.qdm.qualitySpec.InMemoryQualitySpecStore;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpec;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecAttr;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecBase;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecChange;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecCustomer;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecIfLog;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecOrder;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecTerm;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.SpecStatus;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecBatchRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecRunRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecSearchRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.engine.SpecDsl;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 시연 시드(V2__quality_spec.sql)를 메모리 저장소에 그대로 싣고 확인한다 — 사양 원문과 조건·결과 행이 해석기 결과와 같은지,
 * 시연 시나리오(주문 5건의 매칭, 결정적 전송 실패)가 의도대로 나오는지. DB 없이 SQL 의 INSERT 값만 읽는다.
 */
@SuppressWarnings("unchecked")
class QualitySpecSeedTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final Pattern INSERT = Pattern.compile("^INSERT INTO (\\w+) \\(([^)]*)\\) VALUES \\((.*)\\);$");

    private InMemoryQualitySpecStore store;
    private QualitySpecService service;

    @BeforeEach
    void load() throws IOException {
        store = new InMemoryQualitySpecStore();
        for (String line : Files.readAllLines(seedFile(), StandardCharsets.UTF_8)) {
            Matcher m = INSERT.matcher(line.trim());
            if (!m.matches()) continue;
            String[] cols = m.group(2).split(",\\s*");
            List<Object> vals = values(m.group(3));
            assertThat(vals).as(line).hasSize(cols.length);
            Map<String, Object> r = new HashMap<>();
            for (int i = 0; i < cols.length; i++) r.put(cols[i].trim(), vals.get(i));
            put(m.group(1), r);
        }
        Clock clock = Clock.fixed(LocalDateTime.of(2026, 9, 1, 9, 0).atZone(KST).toInstant(), KST);
        service = new QualitySpecService(store, clock, () -> "시연자");
    }

    @Test
    @DisplayName("시드 25건: 원문을 해석하면 저장된 조건·결과 행과 같고, 사양번호는 고객사-품명 접두어를 따른다")
    void seedTermsMatchParser() {
        assertThat(store.specs).hasSize(25);
        List<QualitySpecAttr> dict = store.attrs();
        for (QualitySpec s : store.specs.values()) {
            SpecDsl.Line line = SpecDsl.parseLine(s.getRawText(), dict);
            assertThat(line.issues()).as(s.getSpecNo()).isEmpty();
            assertThat(s.getSpecNo()).startsWith(line.cus() + "-" + line.prd());
            List<String> parsed = new ArrayList<>();
            line.conds().forEach(t -> parsed.add("IF|" + t.attrCd() + "|" + t.op() + "|" + t.val() + "|" + t.unit()));
            line.results().forEach(t -> parsed.add("THEN|" + t.attrCd() + "|" + t.op() + "|" + t.val() + "|" + t.unit()));
            List<String> stored = store.terms(s.getSpecNo()).stream()
                    .sorted((a, b) -> a.getSide().equals(b.getSide()) ? Integer.compare(a.getSeq(), b.getSeq()) : a.isIf() ? -1 : 1)
                    .map(t -> t.getSide() + "|" + t.getAttrCd() + "|" + t.getOp() + "|" + t.getVal() + "|" + t.getUnit()).toList();
            assertThat(stored).as(s.getSpecNo()).containsExactlyElementsOf(parsed);
        }
        Map<String, Integer> counts = (Map<String, Integer>) service.search(new QualitySpecSearchRequest()).get("counts");
        assertThat(counts).containsEntry("DRAFT", 8).containsEntry("CONF", 8).containsEntry("SENT", 6).containsEntry("FAIL", 3);
        assertThat(store.changes).hasSize(55);
        assertThat(store.ifLogs).hasSize(14);
    }

    @Test
    @DisplayName("시연 주문 5건: 충돌(뒤 사양 우선)·단일 적용·전송실패 제외·작성중 제외·사양 없음이 각각 나온다")
    void seedOrdersShowEachCase() {
        assertThat(verdicts("D260831027-010")).containsExactly("320104-L01:NO_MATCH", "320104-L02:APPLIED", "320104-L03:APPLIED");
        assertThat((List<Map<String, Object>>) run("D260831027-010").get("conflicts")).singleElement()
                .satisfies(c -> assertThat(c.get("chain")).isEqualTo("1P-31-81-A1 → 1P-31-83-A2"));
        assertThat(verdicts("D260831014-010")).containsExactly("110197-301:APPLIED");
        assertThat(verdicts("D260831059-020")).containsExactly("320100-G01:EXCLUDED");
        assertThat(verdicts("D260831032-010")).containsExactly("115462-401:EXCLUDED");
        assertThat(verdicts("E260827001-010")).isEmpty();
    }

    @Test
    @DisplayName("시드 재전송: 시간 초과로 실패한 사양은 성공하고, 실패 표시가 있는 사양은 다시 실패한다")
    void seedResend() {
        QualitySpecBatchRequest req = new QualitySpecBatchRequest();
        req.setSpecNos("115462-L01,205202-L01");
        List<Map<String, Object>> results = (List<Map<String, Object>>) service.send(req).get("results");
        assertThat(results).extracting(r -> r.get("specNo") + ":" + r.get("result") + ":" + r.get("ifNo"))
                .containsExactly("115462-L01:OK:IF-20260901-01", "205202-L01:FAIL:IF-20260901-02");
        assertThat(store.spec("115462-L01").orElseThrow().getStatus()).isEqualTo(SpecStatus.SENT);
        assertThat(store.spec("115462-L01").orElseThrow().getFailMsg()).isNull();
    }

    // ── 도움 ──

    private Map<String, Object> run(String ordNo) {
        QualitySpecRunRequest req = new QualitySpecRunRequest();
        req.setOrdNo(ordNo);
        return service.run(req);
    }

    private List<String> verdicts(String ordNo) {
        return ((List<Map<String, Object>>) run(ordNo).get("matches")).stream().map(m -> m.get("specNo") + ":" + m.get("verdict")).toList();
    }

    private static Path seedFile() {
        for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path f = dir.resolve("api/src/main/resources/db/migration/mqc/V2__quality_spec.sql");
            if (Files.isRegularFile(f)) return f;
            Path g = dir.resolve("src/backend/mqc/api/src/main/resources/db/migration/mqc/V2__quality_spec.sql");
            if (Files.isRegularFile(g)) return g;
        }
        throw new IllegalStateException("V2__quality_spec.sql 을 찾지 못했다");
    }

    /** VALUES 목록: '문자'('' 는 '), NULL, 숫자, TO_DATE('…', '…'). */
    private static List<Object> values(String text) {
        List<Object> out = new ArrayList<>();
        int i = 0;
        while (i < text.length()) {
            char c = text.charAt(i);
            if (c == ' ' || c == ',') { i++; continue; }
            if (c == '\'') {
                StringBuilder sb = new StringBuilder();
                i++;
                while (true) {
                    char ch = text.charAt(i);
                    if (ch == '\'' && i + 1 < text.length() && text.charAt(i + 1) == '\'') { sb.append('\''); i += 2; continue; }
                    if (ch == '\'') { i++; break; }
                    sb.append(ch);
                    i++;
                }
                out.add(sb.toString());
            } else if (text.startsWith("TO_DATE(", i)) {
                int start = text.indexOf('\'', i) + 1;
                int end = text.indexOf('\'', start);
                out.add(LocalDateTime.parse(text.substring(start, end), TS));
                i = text.indexOf(')', end) + 1;
            } else {
                int end = i;
                while (end < text.length() && text.charAt(end) != ',') end++;
                String tok = text.substring(i, end).trim();
                out.add("NULL".equals(tok) ? null : Integer.valueOf(tok));
                i = end;
            }
        }
        return out;
    }

    private void put(String table, Map<String, Object> r) {
        switch (table) {
            case "TB_MQC_QSPEC_CUS" -> store.customers.add(QualitySpecCustomer.of(s(r, "CUS_CD"), s(r, "CUS_NM"), n(r, "SEQ")));
            case "TB_MQC_QSPEC_ATTR" -> store.saveAttr(QualitySpecAttr.of(s(r, "ATTR_CD"), s(r, "ATTR_NM"), s(r, "ATTR_KIND"), s(r, "DATA_TYPE"),
                    s(r, "DATA_LEN"), s(r, "UNIT"), s(r, "DESCRIPTION"), "Y".equals(s(r, "USE_YN")), n(r, "SEQ")));
            case "TB_MQC_QSPEC_BASE" -> store.bases.add(QualitySpecBase.of(s(r, "ATTR_CD"), s(r, "BASE_VAL"), s(r, "REMARK"), n(r, "SEQ")));
            case "TB_MQC_QSPEC" -> {
                QualitySpec s = QualitySpec.create(s(r, "SPEC_NO"), s(r, "CUS_CD"), s(r, "PRD_NM_CD"), s(r, "RAW_TEXT"), s(r, "REG_USR_NM"), t(r, "REG_DTTM"));
                s.setRev(n(r, "REV"));
                s.setStatus(s(r, "STATUS"));
                s.setFailMsg(s(r, "FAIL_MSG"));
                s.setSimFailMsg(s(r, "SIM_FAIL_MSG"));
                s.touch(s(r, "MOD_USR_NM"), t(r, "MOD_DTTM"));
                store.saveSpec(s);
            }
            case "TB_MQC_QSPEC_TERM" -> store.terms.add(QualitySpecTerm.of(s(r, "SPEC_NO"), s(r, "SIDE"), n(r, "SEQ"), s(r, "ATTR_CD"),
                    s(r, "ATTR_NM"), s(r, "OP"), s(r, "VAL"), s(r, "UNIT")));
            case "TB_MQC_QSPEC_ORD" -> store.orders.put(s(r, "ORD_NO"), QualitySpecOrder.of(s(r, "ORD_NO"), s(r, "CUS_CD"), s(r, "PRD_NM_CD"),
                    s(r, "QTY"), s(r, "ATTRS_JSON"), t(r, "RECV_DTTM")));
            case "TB_MQC_QSPEC_CHG" -> store.saveChange(QualitySpecChange.of(s(r, "SPEC_NO"), n(r, "REV"), s(r, "ACTION_CD"),
                    s(r, "CHANGES_JSON"), s(r, "WORKER_NM"), t(r, "CHG_DTTM")));
            case "TB_MQC_QSPEC_IF" -> store.saveIfLog(QualitySpecIfLog.of(s(r, "IF_NO"), s(r, "DIRECTION"), s(r, "TARGET"), s(r, "SPEC_NO"),
                    (Integer) r.get("REV"), s(r, "ORD_NO"), s(r, "IF_RESULT"), s(r, "MSG"), n(r, "ELAPSED_MS"), s(r, "PAYLOAD"), t(r, "IF_DTTM")));
            default -> throw new IllegalStateException("모르는 표: " + table);
        }
    }

    private static String s(Map<String, Object> r, String k) { return (String) r.get(k); }
    private static int n(Map<String, Object> r, String k) { return (Integer) r.get(k); }
    private static LocalDateTime t(Map<String, Object> r, String k) { return (LocalDateTime) r.get(k); }
}
