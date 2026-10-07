package com.dongkuk.dmes.mdm.measure;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngCompareRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngSaveRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngSearchRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.service.ColumnMngService;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmColumnSystemRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import com.dongkuk.oasis.audit.AuditHolder;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.StringJoiner;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * P4 — 컬럼 검색·저장·역분해의 SQL 문 수·엔티티 로드 수(결정적). perf-mdm-backend.md P4.
 *
 * <p>두 부분이다.
 * <ol>
 *   <li><b>small-*</b>: {@code ColumnMngLookupCharacterizationTest.쿼리_수_기록}(dev, f2392a4a) 의 시나리오를 그대로 옮긴 것(용어 3·도메인 1·충돌 컬럼
 *       3·역분해 3컬럼 5매핑). 그 시험은 dev 전용 {@code TermDictionaryLoader} 를 써서 기준에 복사할 수 없어 시나리오만 옮겼다. 커밋 본문의 참고값
 *       (save 용어 3행 11→9 등)과 견줄 값은 {@code stmtsWithTrailingFlush}(= QueryCountProbe 정의)다. 검색의 13·33컬럼 값은 복사해 돌리는
 *       {@code ColumnMngSearchCharacterizationTest} 가 낸다(스크립트가 {@code MEASURE P4 char-…} 로 바꾼다).</li>
 *   <li><b>large-*</b>: 저장소 스냅샷(db-snapshot/MDMAPUSER 의 용어·도메인·컬럼·매핑, {@link SourceDb})을 시험 PDB 에 적재한 데이터에서. 검색은 조건 없음·검색어 '두께'·도메인 키워드
 *       'coil' 을, 컬럼의 TERM_IDS 를 그대로 둔 값(asis) 과 참조 용어 ID 수 k 를 10·500·501·2,000·8,000 으로 바꾼 데이터에서 잰다(컬럼마다
 *       원래 원소 수를 지키고 앞 k 개 용어 ID 를 차례로 돌려 쓴다 — 전체 컬럼의 서로 다른 용어 ID 가 정확히 k). 응답 시간은 1회차 참고값
 *       ({@code ms_ref})이다. 저장(용어 N행·충돌 c개)과 역분해(REVERSE, 매핑 m개)도 같은 데이터에서 잰다.</li>
 * </ol>
 * 모든 저장 시나리오는 정상 경로(성공) 또는 기대한 오류 코드(MDM018)인지 확인한다 — 이름 분해 실패(MDM017)·중복(MDM019)으로 일찍 끝난 호출의
 * 작은 문 수가 개선처럼 보이지 않게 한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class MeasureP4ColumnSearchTest extends AbstractMdmSharedDbTest {

    private static final String P = "P4";

    @Autowired
    ColumnMngService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    MdmTermRepository terms;
    @Autowired
    MdmDomainRepository domains;
    @Autowired
    MdmColumnRepository columns;
    @Autowired
    MdmColumnSystemRepository mappings;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager tm;
    @Autowired
    EntityManager em;
    @Autowired
    EntityManagerFactory emf;

    private JdbcTemplate jdbc;
    private StatProbe probe;
    private final List<String> problems = new ArrayList<>();

    @AfterEach
    void tearDown() {
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    @Test
    void 컬럼_검색_저장_역분해_문_수_엔티티_로드() {
        MeasureSupport.assumeEnabled();
        jdbc = new JdbcTemplate(dataSource);
        probe = new StatProbe(tm, em, emf);
        currentUser.set("admin1", Set.of(MdmRoles.STD_ADMIN));
        AuditHolder.remove();
        UserContextHolder.clear();
        MeasureSupport.env(P);

        small();
        large();
        assertTrue(problems.isEmpty(), "기대한 경로가 아니다: " + problems);
    }

    // ── small: 특성 시험 시나리오 그대로 ─────────────────────────────────────

    private void small() {
        DmaTestSupport.clear(jdbc);
        MdmTerm rmtl = DmaTestSupport.term(terms, "원재료", "RMTL", "Raw Material", "[\"원자재(ERP)\"]");
        MdmTerm coil = DmaTestSupport.term(terms, "코일", "COIL", "Coil", null);
        MdmTerm thk = DmaTestSupport.term(terms, "두께", "THK", "Thickness", null);
        MdmDomain dom = DmaTestSupport.domain(domains, "원재료 코일 두께", "RMTL_COIL_THK");
        Long domainId = dom.getDomainId();

        save("small-save-terms0-compose", domainId, List.of(), List.of(), null);
        save("small-save-terms3", domainId, List.of(), termRows(rmtl.getTermId(), coil.getTermId(), thk.getTermId()), null);
        save("small-save-terms6-dup", domainId, List.of(), termRows(rmtl.getTermId(), coil.getTermId(), thk.getTermId(),
                rmtl.getTermId(), coil.getTermId(), thk.getTermId()), null);

        List<Map<String, Object>> conflictRows = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            MdmColumn c = DmaTestSupport.column(columns, "충돌 " + i, "CONF_" + i, null);
            DmaTestSupport.mapping(mappings, c.getColumnId(), "ERP", "CF" + i, null);
            conflictRows.add(sys("ERP", "CF" + i));
        }
        save("small-save-conflict1", domainId, conflictRows.subList(0, 1), List.of(), MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED);
        save("small-save-conflict3", domainId, conflictRows, List.of(), MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED);

        for (int i = 0; i < 3; i++) {
            MdmColumn c = DmaTestSupport.column(columns, "역 " + i, "REV_" + i, null);
            DmaTestSupport.mapping(mappings, c.getColumnId(), "ERP", i == 0 ? "ONE" : "MANY", null);
            DmaTestSupport.mapping(mappings, c.getColumnId(), "MES", "MANY", null);
        }
        compare("small-compare-reverse-1col-1map", "REVERSE", "one", 1);
        compare("small-compare-reverse-3col-5map", "REVERSE", "many", 5);
        compare("small-compare-forward", "FORWARD", "원재료 코일 두께", -1);
    }

    // ── large: 스냅샷 적재 데이터 ─────────────────────────────────────────

    private void large() {
        Map<String, Integer> counts = SourceDb.load(dataSource, true);
        MeasureSupport.emit(P, "data", "source", SourceDb.label(), "terms", counts.get("TB_MDM_TERM"), "domains",
                counts.get("TB_MDM_DOMAIN"), "columns", counts.get("TB_MDM_COLUMN"), "mappings", counts.get("TB_MDM_COLUMN_SYSTEM"));
        int termCount = counts.get("TB_MDM_TERM");
        int columnCount = counts.get("TB_MDM_COLUMN");

        // 검색 — asis 뒤 k 단계
        searches("asis", columnCount);
        List<Long> termIds = jdbc.queryForList("SELECT TERM_ID FROM TB_MDM_TERM ORDER BY TERM_ID", Long.class);
        List<Integer> ks = new ArrayList<>();
        for (int k : MeasureSupport.dry() ? new int[] {10, termCount} : new int[] {10, 500, 501, 2000, 8000}) {
            if (k <= termCount && !ks.contains(k)) {
                ks.add(k);
            }
        }
        for (int k : ks) {
            rewriteTermIds(termIds.subList(0, k));
            searches("k" + k, columnCount);
        }

        // 저장 — 용어 N행
        Long domainId = jdbc.queryForList("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = ?", Long.class, SourceDb.SAVE_PHYS_NAME)
                .stream().findFirst().orElse(null);
        Map<String, Object> pre = service.compare(compareReq("FORWARD", SourceDb.SAVE_COLUMN_NAME));
        MeasureSupport.emit(P, "large-precheck", "placeholder", pre.get("placeholder"), "physName", pre.get("physName"), "domainId",
                domainId);
        Long[] three = jdbc.queryForList("SELECT TERM_ID FROM TB_MDM_TERM WHERE TERM_NAME IN ('원재료','코일','두께') AND SENSE_NO = 1 "
                + "ORDER BY TERM_ID", Long.class).toArray(new Long[0]);
        save("large-save-terms0-compose", domainId, List.of(), List.of(), null);
        save("large-save-terms3", domainId, List.of(), termRows(three), null);
        Long[] six = new Long[three.length * 2];
        System.arraycopy(three, 0, six, 0, three.length);
        System.arraycopy(three, 0, six, three.length, three.length);
        save("large-save-terms6-dup", domainId, List.of(), termRows(six), null);
        for (int n : MeasureSupport.dry() ? new int[] {Math.min(30, termCount)} : new int[] {30, 600}) {
            save("large-save-terms" + n, domainId, List.of(), termRows(termIds.subList(0, n).toArray(new Long[0])), null);
        }

        // 저장 — 충돌 c개(MES 안에서 대문자 기준 한 컬럼만 쓰는 실제 매핑)
        for (int c : MeasureSupport.dry() ? new int[] {1, 3} : new int[] {1, 3, 30}) {
            List<String> phys = jdbc.queryForList("SELECT MIN(PHYS_NAME) FROM TB_MDM_COLUMN_SYSTEM WHERE SYSTEM_CODE = 'MES' "
                    + "GROUP BY UPPER(PHYS_NAME) HAVING COUNT(*) = 1 ORDER BY MIN(COLUMN_ID) FETCH FIRST ? ROWS ONLY", String.class, c);
            List<Map<String, Object>> rows = new ArrayList<>();
            phys.forEach(p -> rows.add(sys("MES", p)));
            save("large-save-conflict" + phys.size(), domainId, rows, List.of(), MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED);
        }

        // 역분해 — 실제 'CHARG' 와 측정용 매핑 m개(앞 m 개 컬럼에 ERP 'MSRREV<m>')
        compare("large-compare-reverse-charg", "REVERSE", "charg", -1);
        List<Long> columnIds = jdbc.queryForList("SELECT COLUMN_ID FROM TB_MDM_COLUMN ORDER BY COLUMN_ID", Long.class);
        for (int m : MeasureSupport.dry() ? new int[] {1, 3} : new int[] {1, 5, 50}) {
            int mm = Math.min(m, columnIds.size());
            for (int i = 0; i < mm; i++) {
                jdbc.update("INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME) VALUES (?, 'ERP', ?)", columnIds.get(i),
                        "MSRREV" + m);
            }
            compare("large-compare-reverse-" + mm + "col-" + mm + "map", "REVERSE", "msrrev" + m, mm);
        }
    }

    private void searches(String label, int columnCount) {
        Object[][] scenarios = {{"none", null, null}, {"kw-dukke", "두께", null}, {"dom-coil", null, "coil"}};
        for (Object[] s : scenarios) {
            ColumnMngSearchRequest req = new ColumnMngSearchRequest();
            req.setKeyword((String) s[1]);
            req.setDomainKeyword((String) s[2]);
            StatProbe.Counts k = probe.inTx(() -> service.search(req));
            String name = "large-" + label + "-search-" + s[0];
            if (k.error() != null) {
                problems.add(name + ": " + k.error());
                MeasureSupport.emit(P, name + "-ERROR", "error", k.error().getClass().getSimpleName());
                continue;
            }
            List<Map<String, Object>> list = list(k.result());
            if ("none".equals(s[0]) && list.size() != columnCount) {
                problems.add(name + " rows=" + list.size() + " columns=" + columnCount);
            }
            long[] t = probe.timeInTx(() -> service.search(req), MeasureSupport.warmup(1), MeasureSupport.reps(3));
            Object[] head = {"rows", list.size(), "kOut", distinctTermIds(list), "dHits", distinctDomains(list)};
            Object[] time = MeasureSupport.timingKv(t);
            MeasureSupport.emit(P, name, MeasureSupport.concat(MeasureSupport.concat(head, k.kv()), "ms_ref", time[1]));
        }
    }

    /**
     * 컬럼마다 원래 원소 수를 지키며 앞 k 개 용어 ID 를 차례로 돌려 쓴다(한 트랜잭션, JDBC 배치).
     * 원소 수는 TERM_IDS 문자열을 읽어 자바에서 센다(JSON 배열 {@code [1,6]} 의 쉼표 수 + 1, 빈 배열·NULL 은 0 — SQLite json_array_length 와 같다).
     */
    private void rewriteTermIds(List<Long> pool) {
        List<Object[]> args = new ArrayList<>();
        int[] pos = {0};
        jdbc.query("SELECT COLUMN_ID, TERM_IDS FROM TB_MDM_COLUMN ORDER BY COLUMN_ID", rs -> {
            long id = rs.getLong(1);
            int len = arrayLength(rs.getString(2));
            StringJoiner j = new StringJoiner(",", "[", "]");
            for (int t = 0; t < len; t++) {
                j.add(String.valueOf(pool.get((pos[0] + t) % pool.size())));
            }
            pos[0] += len;
            args.add(new Object[] {len == 0 ? null : j.toString(), id});
        });
        new TransactionTemplate(tm).executeWithoutResult(st -> jdbc.batchUpdate("UPDATE TB_MDM_COLUMN SET TERM_IDS = ? WHERE COLUMN_ID = ?",
                args, new int[] {Types.VARCHAR, Types.BIGINT}));
    }

    /** 숫자만 든 JSON 배열 문자열의 원소 수. */
    private static int arrayLength(String json) {
        if (json == null) {
            return 0;
        }
        String body = json.strip();
        body = body.startsWith("[") ? body.substring(1) : body;
        body = body.endsWith("]") ? body.substring(0, body.length() - 1) : body;
        return body.isBlank() ? 0 : body.split(",", -1).length;
    }

    private int distinctTermIds(List<Map<String, Object>> list) {
        Set<Long> wanted = new HashSet<>();
        list.forEach(r -> wanted.add(((Number) r.get("columnId")).longValue()));
        Map<Long, String> termIdsByColumn = new HashMap<>();
        jdbc.query("SELECT COLUMN_ID, TERM_IDS FROM TB_MDM_COLUMN", rs -> {
            termIdsByColumn.put(rs.getLong(1), rs.getString(2));
        });
        Set<String> ids = new HashSet<>();
        for (Long c : wanted) {
            String json = termIdsByColumn.get(c);
            if (json == null) {
                continue;
            }
            for (String part : json.replace("[", "").replace("]", "").split(",")) {
                String p = part.trim();
                if (!p.isEmpty() && !"null".equals(p)) {
                    ids.add(p);
                }
            }
        }
        return ids.size();
    }

    private static int distinctDomains(List<Map<String, Object>> list) {
        Set<Object> ids = new HashSet<>();
        list.forEach(r -> {
            if (r.get("domainId") != null) {
                ids.add(r.get("domainId"));
            }
        });
        return ids.size();
    }

    // ── 공용 ─────────────────────────────────────────────────────────────

    /** expected 가 null 이면 성공해야 하고, 아니면 그 오류 코드로 끝나야 한다. */
    private void save(String name, Long domainId, List<Map<String, Object>> systems, List<Map<String, Object>> termRows,
                      MdmErrorCode expected) {
        ColumnMngSaveRequest req = new ColumnMngSaveRequest();
        req.setColumnName(SourceDb.SAVE_COLUMN_NAME);
        req.setPhysName(SourceDb.SAVE_PHYS_NAME);
        req.setDomainId(domainId);
        StatProbe.Counts k = probe.inTx(() -> service.save(req, systems, termRows));
        String err = code(k.error());
        boolean ok = expected == null ? k.error() == null : expected.code().equals(err);
        if (!ok) {
            problems.add(name + " expected=" + (expected == null ? "ok" : expected.code()) + " got=" + (err == null ? "ok" : err));
        }
        MeasureSupport.emit(P, name, MeasureSupport.concat(new Object[] {"termRows", termRows.size(), "systemRows", systems.size(),
                "ok", ok, "err", err == null ? "-" : err}, k.kv()));
        AuditHolder.remove();
        UserContextHolder.clear();
    }

    /** expectDups 가 0 이상이면 duplicates 행 수가 그 값이어야 한다. */
    private void compare(String name, String direction, String input, int expectDups) {
        StatProbe.Counts k = probe.inTx(() -> service.compare(compareReq(direction, input)));
        int dups = -1;
        if (k.result() instanceof Map<?, ?> m && m.get("duplicates") instanceof List<?> l) {
            dups = l.size();
        }
        if (k.error() != null || (expectDups >= 0 && dups != expectDups)) {
            problems.add(name + " dups=" + dups + " expected=" + expectDups + " error=" + k.error());
        }
        MeasureSupport.emit(P, name, MeasureSupport.concat(new Object[] {"dups", dups}, k.kv()));
    }

    private static String code(RuntimeException e) {
        if (e == null) {
            return null;
        }
        if (e instanceof BusinessException b && b.getErrors() != null && !b.getErrors().isEmpty()) {
            return b.getErrors().get(0).code();
        }
        return e.getClass().getSimpleName();
    }

    private static ColumnMngCompareRequest compareReq(String direction, String input) {
        ColumnMngCompareRequest req = new ColumnMngCompareRequest();
        req.setDirection(direction);
        req.setInput(input);
        return req;
    }

    private static Map<String, Object> sys(String system, String phys) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("systemCode", system);
        row.put("physName", phys);
        return row;
    }

    private static List<Map<String, Object>> termRows(Long... ids) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Long id : ids) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("termId", id);
            rows.add(row);
        }
        return rows;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Object result) {
        return (List<Map<String, Object>>) ((Map<String, Object>) result).get("list");
    }
}
