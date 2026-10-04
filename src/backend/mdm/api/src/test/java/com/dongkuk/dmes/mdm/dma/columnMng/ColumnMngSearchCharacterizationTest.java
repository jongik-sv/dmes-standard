package com.dongkuk.dmes.mdm.dma.columnMng;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.common.dictionary.ColumnDescriptionSanitizer;
import com.dongkuk.dmes.mdm.common.perf.QueryCountProbe;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngSearchRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.service.ColumnMngService;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmColumnSystemRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
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

/**
 * 항목 4(컬럼 검색 SQL 내리기) 1단계 특성 테스트 — {@code columnMng.search} 의 지금 동작을 실제 SQLite 스키마로 고정한다.
 *
 * <p>지금 search 는 도메인·용어·시스템 매핑·컬럼 네 표를 전부 읽고 Java 에서 거른다. 그래서 다음이 성립한다 — SQL 로 내릴 때
 * 갈라지기 쉬운 곳들이다.
 * <ul>
 *   <li>{@code %}·{@code _}·{@code \} 는 글자 그대로다(LIKE 와일드카드가 아니다).</li>
 *   <li>대소문자 무시는 {@code toLowerCase(Locale.ROOT)} 다 — ASCII 밖 라틴 글자({@code Ä}/{@code ä})도 접힌다(SQLite {@code LOWER} 는 ASCII 만 접는다).</li>
 *   <li>검색어 앞뒤 자르기는 {@code String.trim()} 이다 — 전각 공백(U+3000)은 자르지 않는다.</li>
 *   <li>매핑이 여러 개 걸려도 컬럼은 한 번만 나온다(JOIN 으로 바꾸면 중복이 생긴다).</li>
 *   <li>정렬은 Java {@code String.compareTo}(UTF-16 코드 단위) — 숫자 &lt; 대문자 &lt; {@code _} &lt; 소문자 &lt; Ä &lt; 한글. COLUMN_NAME 은 유일 인덱스라
 *       columnId 보조 정렬은 실제로 쓰이지 않는다.</li>
 *   <li>도메인 키워드는 도메인 ID 의 10진 문자열에도 부분 일치한다. 도메인이 없거나 가리키는 도메인 행이 없는 컬럼은 도메인 키워드가 있으면 빠진다.</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmaTestSupport.Config.class)
class ColumnMngSearchCharacterizationTest extends AbstractMdmSharedDbTest {

    /** 조건 없는 검색의 전체 순서(Java String.compareTo). */
    private static final List<String> ALL_ORDER = List.of("100%율", "1번 컬럼", "A B", "A_B", "B컬럼", "_밑줄", "a컬럼",
            "Ärger", "가나", "경로\\구분", "매핑 컬럼", "코일 두께", "코일ID");

    private static final List<String> ROW_KEYS = List.of("columnId", "columnName", "physName", "labelLong", "labelMid",
            "labelShort", "domainId", "domainName", "domainStdName", "required", "termNames", "systemFields", "usageNote");

    private static final String USAGE_HTML = "<p>메모 <b>굵게</b></p>";

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
    private QueryCountProbe probe;
    private MdmTerm rmtl;
    private MdmDomain dCoil;
    private MdmDomain dPct;
    private MdmDomain dLabel;
    private MdmColumn coilThk;
    private MdmColumn mapped;
    private MdmColumn noDomain;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        DmaTestSupport.clear(jdbc);
        currentUser.set("viewer", Set.of(MdmRoles.STEWARD));
        probe = new QueryCountProbe(tm, em, emf, "columnMng.search");
        probe.start();
        seed();
    }

    @AfterEach
    void tearDown() {
        probe.stop();
    }

    private void seed() {
        rmtl = DmaTestSupport.term(terms, "원재료", "RMTL", "Raw Material", null);
        dCoil = DmaTestSupport.domain(domains, "Coil 두께", "COIL_THK");
        dPct = DmaTestSupport.domain(domains, "백분율%", "PCT_RATE");
        dLabel = DmaTestSupport.domain(domains, "도메인전용", "ONLYDOM");

        DmaTestSupport.column(columns, "1번 컬럼", "NO1_COL", dCoil.getDomainId());
        DmaTestSupport.column(columns, "A B", "SA_COL", dPct.getDomainId());
        DmaTestSupport.column(columns, "A_B", "A_US_B", dLabel.getDomainId());
        noDomain = DmaTestSupport.column(columns, "B컬럼", "B_COL", null);
        noDomain.setTermIds("[]");
        columns.save(noDomain);
        DmaTestSupport.column(columns, "_밑줄", "US_COL", dCoil.getDomainId());
        DmaTestSupport.column(columns, "a컬럼", "XABCX", dCoil.getDomainId());
        DmaTestSupport.column(columns, "Ärger", "AERGER", dPct.getDomainId());
        DmaTestSupport.column(columns, "가나", "GANA", dCoil.getDomainId());
        DmaTestSupport.column(columns, "100%율", "PCT_COL", dPct.getDomainId());
        DmaTestSupport.column(columns, "경로\\구분", "PATH_COL", null);
        DmaTestSupport.column(columns, "코일ID", "COIL_ID", dCoil.getDomainId());

        coilThk = DmaTestSupport.column(columns, "코일 두께", "COIL_THK", dCoil.getDomainId());
        coilThk.setLabelLong("라벨전용");
        coilThk.setDescription("설명전용");
        coilThk.setUsageNote("메모전용");
        coilThk.setRequired(true);
        coilThk.setTermIds("[" + rmtl.getTermId() + ",null,99999," + rmtl.getTermId() + "]");
        coilThk = columns.save(coilThk);
        DmaTestSupport.mapping(mappings, coilThk.getColumnId(), "MES", "ZZ_HIT2", null);
        DmaTestSupport.mapping(mappings, coilThk.getColumnId(), "ERP", "ZZ_HIT1", null);

        mapped = DmaTestSupport.column(columns, "매핑 컬럼", "MAP_COL", dLabel.getDomainId());
        mapped.setUsageNote(USAGE_HTML);
        mapped = columns.save(mapped);
        DmaTestSupport.mapping(mappings, mapped.getColumnId(), "ERP", "MatNr", null);
        DmaTestSupport.mapping(mappings, mapped.getColumnId(), "MES", "Amb", null);
        DmaTestSupport.mapping(mappings, mapped.getColumnId(), "ERP", "amb", null);
        DmaTestSupport.mapping(mappings, mapped.getColumnId(), "APS", "z", null);
        DmaTestSupport.mapping(mappings, mapped.getColumnId(), "ERP", "AMB", null);
    }

    // ── 조건 없음·응답 모양 ───────────────────────────────────────────────

    @Test
    void 조건이_없으면_전체를_Java_문자열_순서로_돌려준다() {
        assertEquals(ALL_ORDER, names(service.search(new ColumnMngSearchRequest())));
        assertEquals(ALL_ORDER, names(service.search(null)), "요청이 null 이어도 전체");
        assertEquals(ALL_ORDER, names(service.search(search("   ", "   "))), "공백만 있는 조건은 조건 없음");
        assertEquals(ALL_ORDER, names(service.search(search(null, null))));
    }

    @Test
    void 응답은_list_와_systems_두_키이고_systems_는_자기_시스템을_뺀_코드_순서다() {
        Map<String, Object> out = service.search(new ColumnMngSearchRequest());

        assertEquals(List.of("list", "systems"), new ArrayList<>(out.keySet()));
        assertEquals(List.of("APS", "DKMS", "ERP", "L2", "MES"),
                maps(out.get("systems")).stream().map(m -> m.get("systemCode")).toList());
        assertEquals(List.of("systemCode", "systemName"), new ArrayList<>(maps(out.get("systems")).get(0).keySet()));
        assertEquals(13, maps(out.get("list")).size());
    }

    @Test
    void 목록_행은_13개_키를_고정_순서로_싣고_값_형식이_정해져_있다() {
        List<Map<String, Object>> list = maps(service.search(new ColumnMngSearchRequest()).get("list"));
        for (Map<String, Object> row : list) {
            assertEquals(ROW_KEYS, new ArrayList<>(row.keySet()), "행 " + row.get("columnName"));
        }

        Map<String, Object> thk = row(list, "코일 두께");
        assertEquals(coilThk.getColumnId(), thk.get("columnId"));
        assertEquals(Long.class, thk.get("columnId").getClass(), "columnId 는 Long");
        assertEquals("COIL_THK", thk.get("physName"));
        assertEquals("라벨전용", thk.get("labelLong"));
        assertEquals(null, thk.get("labelMid"));
        assertEquals(null, thk.get("labelShort"));
        assertEquals(dCoil.getDomainId(), thk.get("domainId"));
        assertEquals(Long.class, thk.get("domainId").getClass(), "domainId 는 Long");
        assertEquals("Coil 두께", thk.get("domainName"));
        assertEquals("COIL_THK", thk.get("domainStdName"));
        assertEquals("Y", thk.get("required"));
        assertEquals("원재료 + *** + ? + 원재료", thk.get("termNames"), "null 자리는 ***, 없는 용어는 ?, 반복은 그대로");
        assertEquals("ERP:ZZ_HIT1, MES:ZZ_HIT2", thk.get("systemFields"));
        assertEquals("메모전용", thk.get("usageNote"));

        Map<String, Object> map = row(list, "매핑 컬럼");
        assertEquals("N", map.get("required"));
        assertEquals("", map.get("termNames"), "TERM_IDS 가 null 이면 빈 문자열");
        assertEquals("APS:z, ERP:AMB, ERP:MatNr, ERP:amb, MES:Amb", map.get("systemFields"),
                "매핑은 시스템 코드 → 실제 필드명(대문자 먼저) 순서");
        assertEquals(ColumnDescriptionSanitizer.plainText(USAGE_HTML), map.get("usageNote"), "목록의 활용처 메모는 글자만");
        assertEquals(dLabel.getDomainId(), map.get("domainId"));
        assertEquals("ONLYDOM", map.get("domainStdName"));

        Map<String, Object> none = row(list, "B컬럼");
        assertEquals(null, none.get("domainId"));
        assertEquals(null, none.get("domainName"));
        assertEquals(null, none.get("domainStdName"));
        assertEquals("", none.get("termNames"), "TERM_IDS 가 [] 이면 빈 문자열");
        assertEquals("", none.get("systemFields"));
        assertEquals(null, none.get("usageNote"));
    }

    // ── 검색어(keyword) ───────────────────────────────────────────────────

    @Test
    void 검색어는_논리명에_대소문자_무시_부분_일치한다() {
        assertEquals(List.of("코일 두께"), names(service.search(search("두께", null))), "한글 부분 일치");
        assertEquals(List.of("코일 두께"), names(service.search(search("코일 두", null))), "가운데 공백 포함");
        assertEquals(List.of("코일ID"), names(service.search(search("코일id", null))), "한글+영문 대소문자 무시");
        assertEquals(List.of("A B", "A_B", "a컬럼"), names(service.search(search("a", null))).stream()
                .filter(n -> n.startsWith("A") || n.startsWith("a")).toList(), "ASCII 대소문자 무시");
        assertEquals(List.of("Ärger"), names(service.search(search("ärg", null))), "ASCII 밖 라틴 글자도 접는다(Locale.ROOT)");
        assertEquals(List.of("Ärger"), names(service.search(search("ÄRG", null))));
        assertEquals(List.of(), names(service.search(search("없는말", null))));
    }

    @Test
    void 검색어는_표준_물리명에도_대소문자_무시_부분_일치한다() {
        assertEquals(List.of("코일ID"), names(service.search(search("coil_i", null))));
        assertEquals(List.of("Ärger"), names(service.search(search("aerg", null))));
        assertEquals(List.of("a컬럼"), names(service.search(search("XAB", null))));
    }

    @Test
    void 검색어의_퍼센트_밑줄_역슬래시는_글자_그대로다() {
        assertEquals(List.of("A B"), names(service.search(search("a_c", null))),
                "a_c 는 SA_COL 만 — LIKE 였다면 XABCX(a컬럼) 도 걸린다");
        assertEquals(List.of(), names(service.search(search("a%c", null))), "LIKE 였다면 SA_COL·XABCX 가 걸린다");
        assertEquals(List.of("100%율"), names(service.search(search("%", null))));
        assertEquals(List.of("100%율"), names(service.search(search("0%율", null))));
        assertEquals(List.of("경로\\구분"), names(service.search(search("\\", null))));
        assertEquals(List.of("경로\\구분"), names(service.search(search("로\\구", null))));
        List<String> underscore = names(service.search(search("_", null)));
        assertEquals(List.of("100%율", "1번 컬럼", "A B", "A_B", "B컬럼", "_밑줄", "경로\\구분", "매핑 컬럼", "코일 두께", "코일ID"),
                underscore, "밑줄 한 글자는 이름·물리명·매핑에 실제 _ 가 있는 컬럼만");
    }

    @Test
    void 검색어는_시스템별_실제_필드명에도_걸리고_컬럼은_한_번만_나온다() {
        assertEquals(List.of("코일 두께"), names(service.search(search("zz_hit", null))), "매핑 두 개가 걸려도 한 행");
        assertEquals(List.of("코일 두께"), names(service.search(search("ZZ_HIT1", null))));
        assertEquals(List.of("매핑 컬럼"), names(service.search(search("matnr", null))));
        assertEquals(List.of("매핑 컬럼"), names(service.search(search("amb", null))), "대소문자만 다른 매핑 세 개 → 한 행");
    }

    @Test
    void 검색어는_표시명_설명_활용처_메모_도메인명_시스템코드에는_걸리지_않는다() {
        assertEquals(List.of(), names(service.search(search("라벨전용", null))));
        assertEquals(List.of(), names(service.search(search("설명전용", null))));
        assertEquals(List.of(), names(service.search(search("메모전용", null))));
        assertEquals(List.of(), names(service.search(search("도메인전용", null))));
        assertEquals(List.of(), names(service.search(search("onlydom", null))));
        assertEquals(List.of(), names(service.search(search("erp", null))), "systemFields 의 시스템 코드는 검색 대상이 아니다");
        assertEquals(List.of(), names(service.search(search("aps:", null))));
        assertEquals(List.of(), names(service.search(search("굵게", null))), "HTML 활용처 메모도 아니다");
    }

    @Test
    void 검색어는_String_trim_으로만_자른다() {
        assertEquals(List.of("코일 두께"), names(service.search(search(" 두께 ", null))));
        assertEquals(List.of("코일 두께"), names(service.search(search("\t두께\n", null))));
        assertEquals(List.of(), names(service.search(search("　두께", null))), "전각 공백은 자르지 않는다");
    }

    // ── 도메인 키워드(domainKeyword) ──────────────────────────────────────

    @Test
    void 도메인_키워드는_도메인명_표준명에_대소문자_무시_부분_일치한다() {
        List<String> coil = List.of("1번 컬럼", "_밑줄", "a컬럼", "가나", "코일 두께", "코일ID");
        List<String> pct = List.of("100%율", "A B", "Ärger");
        assertEquals(coil, names(service.search(search(null, "coil 두"))), "도메인명");
        assertEquals(coil, names(service.search(search(null, "COIL_THK"))), "표준명 대문자");
        assertEquals(coil, names(service.search(search("", " coil_thk "))), "표준명 소문자·앞뒤 공백");
        assertEquals(pct, names(service.search(search(null, "백분율"))));
        assertEquals(List.of("A_B", "매핑 컬럼"), names(service.search(search(null, "도메인전용"))));
        assertEquals(List.of(), names(service.search(search(null, "없는도메인"))));
        assertEquals(List.of(), names(service.search(search(null, "　coil"))), "전각 공백은 자르지 않는다");
    }

    @Test
    void 도메인_키워드의_퍼센트_밑줄은_글자_그대로다() {
        List<String> pct = List.of("100%율", "A B", "Ärger");
        assertEquals(pct, names(service.search(search(null, "%"))), "도메인명 '백분율%'");
        assertEquals(pct, names(service.search(search(null, "t_r"))), "PCT_RATE");
        assertEquals(List.of(), names(service.search(search(null, "t%r"))), "LIKE 였다면 PCT_RATE 가 걸린다");
        assertEquals(List.of(), names(service.search(search(null, "c_i"))), "LIKE 였다면 COIL_THK(c-o-i) 가 걸린다");
        assertEquals(List.of("100%율", "1번 컬럼", "A B", "_밑줄", "a컬럼", "Ärger", "가나", "코일 두께", "코일ID"),
                names(service.search(search(null, "_"))), "표준명에 _ 가 있는 두 도메인만(ONLYDOM 제외)");
    }

    @Test
    void 도메인_키워드는_도메인_ID_10진_문자열에도_부분_일치한다() {
        String full = String.valueOf(dLabel.getDomainId());
        assertEquals(expectedByDomainId(full), names(service.search(search(null, full))));
        String lastDigit = full.substring(full.length() - 1);
        assertEquals(expectedByDomainId(lastDigit), names(service.search(search(null, lastDigit))),
                "한 자리 숫자는 그 숫자가 들어간 모든 도메인 ID");
    }

    /** 도메인 ID 숫자 키워드의 기대값 — 숫자는 도메인명·표준명에 없으므로 ID 문자열 포함 여부만 본다. */
    private List<String> expectedByDomainId(String needle) {
        Map<Long, List<String>> byDomain = Map.of(
                dCoil.getDomainId(), List.of("1번 컬럼", "_밑줄", "a컬럼", "가나", "코일 두께", "코일ID"),
                dPct.getDomainId(), List.of("100%율", "A B", "Ärger"),
                dLabel.getDomainId(), List.of("A_B", "매핑 컬럼"));
        List<String> out = new ArrayList<>();
        byDomain.forEach((id, names) -> {
            if (String.valueOf(id).contains(needle)) {
                out.addAll(names);
            }
        });
        return ALL_ORDER.stream().filter(out::contains).toList();
    }

    @Test
    void 도메인_키워드가_있으면_도메인_없는_컬럼은_빠지고_검색어와는_AND_다() {
        assertEquals(List.of(), names(service.search(search("B컬럼", "b"))), "도메인 없는 컬럼은 도메인 키워드에 걸리지 않는다");
        assertEquals(List.of("B컬럼"), names(service.search(search("B컬럼", ""))));
        assertEquals(List.of("A B", "Ärger"), names(service.search(search("a", "pct"))), "검색어 a(물리명 SA_COL·AERGER) AND 도메인 PCT");
        assertEquals(List.of("매핑 컬럼"), names(service.search(search("amb", "도메인전용"))));
        assertEquals(List.of(), names(service.search(search("amb", "coil"))));
    }

    @Test
    void 가리키는_도메인_행이_없는_컬럼은_목록엔_도메인명_없이_나오고_도메인_키워드엔_빠진다() throws SQLException {
        withForeignKeysOff("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ)"
                + " VALUES ('유령도메인', 'GHOST_DOM', 999999, 0, 0)");

        List<Map<String, Object>> list = maps(service.search(new ColumnMngSearchRequest()).get("list"));
        Map<String, Object> ghost = row(list, "유령도메인");
        assertEquals(999999L, ghost.get("domainId"));
        assertEquals(null, ghost.get("domainName"));
        assertEquals(null, ghost.get("domainStdName"));
        assertEquals(List.of(), names(service.search(search("유령", "9"))), "ID 문자열은 도메인 행에서 읽으므로 걸리지 않는다");
        assertEquals(List.of("유령도메인"), names(service.search(search("유령", null))));
    }

    // ── 쿼리 수(기록용) ───────────────────────────────────────────────────

    /**
     * 지금 쿼리 수를 남긴다(단언하지 않는다 — 2단계가 바꿀 값이다). Hibernate 문만 센다 — {@code systems()} 의 JdbcTemplate 조회는
     * 세지 않는다. 결과는 {@code [query-count] columnMng.search ...} 줄로 찍힌다.
     */
    @Test
    void 쿼리_수_기록() {
        probe.measureInTx("search-none-13cols", () -> service.search(new ColumnMngSearchRequest()));
        probe.measureInTx("search-keyword-13cols", () -> service.search(search("두께", null)));
        probe.measureInTx("search-domain-13cols", () -> service.search(search(null, "coil")));
        probe.measureInTx("search-optionsOnly", () -> {
            ColumnMngSearchRequest q = new ColumnMngSearchRequest();
            q.setOptionsOnly(true);
            return service.search(q);
        });
        for (int i = 0; i < 20; i++) {
            MdmColumn c = DmaTestSupport.column(columns, "추가 " + i, "ADD_" + i, dCoil.getDomainId());
            DmaTestSupport.mapping(mappings, c.getColumnId(), "ERP", "ADD_F" + i, null);
        }
        probe.measureInTx("search-none-33cols", () -> service.search(new ColumnMngSearchRequest()));
        probe.measureInTx("search-keyword-33cols", () -> service.search(search("두께", null)));
    }

    // ── helpers ───────────────────────────────────────────────────────────

    /** 풀 연결은 외래키 강제가 켜져 있다 — 한 autocommit 연결에서만 끄고 넣은 뒤 반드시 다시 켠다. */
    private void withForeignKeysOff(String sql) throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            c.setAutoCommit(true);
            st.execute("PRAGMA foreign_keys = OFF");
            try {
                st.execute(sql);
            } finally {
                st.execute("PRAGMA foreign_keys = ON");
            }
        }
    }

    private static ColumnMngSearchRequest search(String keyword, String domainKeyword) {
        ColumnMngSearchRequest req = new ColumnMngSearchRequest();
        req.setKeyword(keyword);
        req.setDomainKeyword(domainKeyword);
        return req;
    }

    private static List<String> names(Map<String, Object> result) {
        return maps(result.get("list")).stream().map(m -> (String) m.get("columnName")).toList();
    }

    private static Map<String, Object> row(List<Map<String, Object>> list, String columnName) {
        return list.stream().filter(m -> columnName.equals(m.get("columnName"))).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> maps(Object value) {
        return (List<Map<String, Object>>) value;
    }
}
