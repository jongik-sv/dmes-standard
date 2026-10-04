package com.dongkuk.dmes.mdm.dma.termMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.termMng.TermRecommendationCache.CachedTerm;
import com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermRow;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSaveRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSaveResult;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSearchRequest;
import com.dongkuk.dmes.mdm.dma.termMng.service.TermMngService;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.test.context.ActiveProfiles;

/**
 * 용어 JSON 목록 칸(SYNONYMS·ALIASES·SYSTEMS) 읽기·쓰기 특성 시험 — 파서 공통화 전에 지금 동작을 고정한다.
 *
 * <p>읽기: {@code TermMngService}(검색 결과 행)와 {@code TermRecommendationCache}(캐시 항목)는 같은 엄격한 파서다 —
 * {@code new ObjectMapper().readValue(json, List<String>)}, 실패하면 빈 목록. 두 파서를 같은 입력 행렬로 나란히 고정한다.
 * 쓰기: {@code TermMngService.save} 는 기본 {@code new ObjectMapper()} 로 쓴다 — 한글을 {@code \\uXXXX} 로 바꾸지 않는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class TermJsonListCharacterizationTest extends AbstractMdmSharedDbTest {

    @Autowired
    TermMngService service;
    @Autowired
    MdmTermRepository termRepository;
    @Autowired
    TermRecommendationCache cache;

    private int senseSeq;

    @BeforeEach
    void cleanUp() {
        termRepository.deleteAll();
        cache.reloadAll();
        senseSeq = 0;
    }

    /** 입력 원문 → 엄격한 파서의 기대 결과(null 이면 결과 자체가 null). */
    private record Case(String raw, List<String> expected) {
    }

    private static List<String> list(String... values) {
        return new ArrayList<>(Arrays.asList(values));
    }

    /**
     * DB 에 넣을 수 있는 입력만 — SQLite 스키마(V3)의 {@code CHECK (칸 IS NULL OR json_valid(칸))} 가 깨진 JSON·빈 문자열·공백을
     * 거부한다(아래 시험이 고정). 그런 입력은 lib 의 {@code TermJsonListParserCharacterizationTest} 가 가짜 저장소로 고정한다.
     */
    private static final List<Case> MATRIX = List.of(
            new Case(null, List.of()),
            new Case("[]", List.of()),
            new Case("[\"a\",\"b\"]", list("a", "b")),
            new Case("  [ \"a\" , \"b\" ]  ", list("a", "b")),
            new Case("[\"a\",\"a\"]", list("a", "a")),
            // 배열이 아닌 JSON
            new Case("{\"a\":1}", List.of()),
            new Case("\"abc\"", List.of()),
            new Case("\"\"", List.of()),
            new Case("3", List.of()),
            // 원소 모양
            new Case("[\" a \",\"\",null,\"   \"]", list(" a ", "", null, "   ")),
            new Case("[1,true,1.5]", list("1", "true", "1.5")),
            new Case("[{\"name\":\"x\"}]", List.of()),
            new Case("[[\"a\"]]", List.of()),
            new Case("[\"배치(ERP)\"]", list("배치(ERP)")),
            // 이스케이프
            new Case("[\"\\uBC30\\uCE58\"]", list("배치")),
            new Case("[\"따옴\\\"표\",\"역\\\\슬\"]", list("따옴\"표", "역\\슬")));

    private Long seedRaw(String raw) {
        MdmTerm t = new MdmTerm("행" + (++senseSeq), senseSeq, "정의");
        t.setSynonyms(raw);
        t.setAliases(raw);
        t.setSystems(raw);
        return termRepository.saveAndFlush(t).getTermId();
    }

    @Test
    void 검색_결과_행과_추천_캐시는_같은_입력에_같은_목록을_돌려준다() {
        List<Long> ids = new ArrayList<>();
        for (Case c : MATRIX) {
            ids.add(seedRaw(c.raw()));
        }
        cache.reloadAll();

        List<TermRow> rows = service.search(null).getList();
        assertEquals(MATRIX.size(), rows.size());
        for (int i = 0; i < MATRIX.size(); i++) {
            Case c = MATRIX.get(i);
            TermRow row = rows.get(i);
            assertEquals(ids.get(i), row.getTermId());
            String label = "입력=" + c.raw();
            assertEquals(c.expected(), row.getSynonyms(), "검색 synonyms " + label);
            assertEquals(c.expected(), row.getAliases(), "검색 aliases " + label);
            assertEquals(c.expected(), row.getSystems(), "검색 systems " + label);

            CachedTerm cached = cache.get(ids.get(i));
            assertEquals(c.expected(), cached.synonyms(), "캐시 synonyms " + label);
            assertEquals(c.expected(), cached.aliases(), "캐시 aliases " + label);
            assertEquals(c.expected(), cached.systems(), "캐시 systems " + label);
        }
    }

    @Test
    void 캐시_단건_갱신도_전체_적재와_같은_파서를_쓴다() {
        for (Case c : MATRIX) {
            Long id = seedRaw(c.raw());
            cache.refresh(id);
            assertEquals(c.expected(), cache.get(id).synonyms(), "refresh 입력=" + c.raw());
        }
    }

    @Test
    void SQLite_스키마는_JSON이_아닌_값을_세_칸_모두_거부한다() {
        for (String raw : List.of("", "   ", "[\"a\"", "[\"a\",]", "[\"a\"] x", "abc", "배치")) {
            assertThrows(DataAccessException.class, () -> seedRaw(raw), "입력=" + raw);
        }
        for (String column : List.of("SYNONYMS", "ALIASES", "SYSTEMS")) {
            MdmTerm t = new MdmTerm("칸" + column, ++senseSeq, "정의");
            switch (column) {
                case "SYNONYMS" -> t.setSynonyms("[\"a\"");
                case "ALIASES" -> t.setAliases("[\"a\"");
                default -> t.setSystems("[\"a\"");
            }
            assertThrows(DataAccessException.class, () -> termRepository.saveAndFlush(t), column);
        }
        assertEquals(0, termRepository.count());
    }

    // ── JSON null 리터럴 / 빈 문자열 리터럴 — 결과가 null 이 되는 경로 ──

    @Test
    void JSON_null_리터럴은_빈_목록이_아니라_null이_된다() {
        Long nullLiteral = seedRaw("null");
        Long emptyString = seedRaw("\"\"");
        cache.reloadAll();

        List<TermRow> rows = service.search(null).getList();
        assertEquals(nullLiteral, rows.get(0).getTermId());
        assertNull(rows.get(0).getSynonyms(), "검색 결과 행의 synonyms 가 빈 목록이 아니라 null");
        assertNull(rows.get(0).getSystems());
        assertNull(cache.get(nullLiteral).synonyms(), "캐시 항목의 synonyms 도 null");
        assertEquals(emptyString, rows.get(1).getTermId());
        assertEquals(List.of(), rows.get(1).getSynonyms(), "JSON 빈 문자열 리터럴 \"\" 은 빈 목록이다(null 아님)");
        assertEquals(List.of(), cache.get(emptyString).synonyms());
    }

    @Test
    void JSON_null_리터럴이_있으면_키워드_검색과_시스템_조건_검색이_NPE로_실패한다() {
        // 기존 결함 고정: readStringList 가 null 을 돌려주고 .stream() 에서 NPE.
        seedRaw("null");
        TermSearchRequest byKeyword = new TermSearchRequest();
        byKeyword.setKeyword("없는말");
        assertThrows(NullPointerException.class, () -> service.search(byKeyword));

        TermSearchRequest bySystem = new TermSearchRequest();
        bySystem.setSystems("MES");
        assertThrows(NullPointerException.class, () -> service.search(bySystem));
    }

    @Test
    void JSON_null_리터럴이_캐시에_있으면_1차_추천이_NPE로_실패한다() {
        // 기존 결함 고정: CachedTerm.synonyms() 가 null 이라 for-each 에서 NPE.
        seedRaw("null");
        cache.reloadAll();
        RecommendRequest request = new RecommendRequest();
        request.setTermName("코일");
        assertThrows(NullPointerException.class, () -> service.recommend(request));
    }

    @Test
    void 원소에_null이_있어도_키워드_검색은_그_원소만_건너뛴다() {
        Long id = seedRaw("[null,\"배치\"]");
        TermSearchRequest r = new TermSearchRequest();
        r.setKeyword("배치");
        assertEquals(List.of(id), service.search(r).getList().stream().map(TermRow::getTermId).toList());
    }

    // ── 쓰기(save) — 저장 원문 모양 ──

    @Test
    void 저장은_한글을_이스케이프하지_않고_공백_없는_JSON_배열로_쓴다() {
        TermSaveRequest request = new TermSaveRequest();
        request.setTermName("코일");
        request.setSenseNo(1);
        request.setDefinition("감아 놓은 강판");
        request.setSynonyms(" 배치(ERP) , 뱃치 ,, ");
        request.setAliases("따옴\"표,역\\슬,탭\t안");
        request.setSystems("MES");
        TermSaveResult saved = service.save(request);

        MdmTerm stored = termRepository.findById(saved.getTermId()).orElseThrow();
        assertEquals("[\"배치(ERP)\",\"뱃치\"]", stored.getSynonyms());
        assertEquals("[\"따옴\\\"표\",\"역\\\\슬\",\"탭\\t안\"]", stored.getAliases(),
                "따옴표·역슬래시·제어문자만 이스케이프한다");
        assertEquals("[\"MES\"]", stored.getSystems());
        assertFalse(stored.getSynonyms().contains("\\u"), "한글을 \\uXXXX 로 쓰지 않는다");
        assertTrue(stored.getSynonyms().contains("배치"));
    }

    @Test
    void 저장할_목록이_비면_칸을_null로_쓴다() {
        TermSaveRequest request = new TermSaveRequest();
        request.setTermName("빈목록");
        request.setSenseNo(1);
        request.setDefinition("정의");
        request.setSynonyms(" , ,");
        request.setAliases("");
        request.setSystems(null);
        TermSaveResult saved = service.save(request);

        MdmTerm stored = termRepository.findById(saved.getTermId()).orElseThrow();
        assertNull(stored.getSynonyms());
        assertNull(stored.getAliases());
        assertNull(stored.getSystems());
    }
}
