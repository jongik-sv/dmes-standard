package com.dongkuk.dmes.mdm.dma.termMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.termMng.TermRecommendationCache.CachedTerm;
import com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendCandidate;
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
import java.util.Map;
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
 * {@code new ObjectMapper().readValue(json, List<String>)}, 실패하면 빈 목록. 원소 null 은 버린다(D2 수정). 두 파서를 같은 입력
 * 행렬로 나란히 고정한다.
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

    /** 입력 원문 → 엄격한 파서의 기대 결과. 결과 목록 자체는 null 이 아니다(D1 수정). */
    private record Case(String raw, List<String> expected) {
    }

    private static List<String> list(String... values) {
        return new ArrayList<>(Arrays.asList(values));
    }

    /**
     * DB 에 넣을 수 있는 입력만 — Oracle 스키마의 {@code CHECK (칸 IS NULL OR 칸 IS JSON STRICT)} 가 깨진 JSON·공백을 거부한다(아래 시험이
     * 고정). 빈 문자열은 Oracle 이 NULL 로 저장하므로 거부되지 않고 null 입력과 같다. 그런 입력은 lib 의 {@code TermJsonListParserCharacterizationTest} 가 가짜 저장소로 고정한다.
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
            // D2 수정(fix): 원소 null 은 버린다(예전에는 null 원소로 남았다). 공백·빈 문자열 원소는 그대로 남는다.
            new Case("[\" a \",\"\",null,\"   \"]", list(" a ", "", "   ")),
            new Case("[null]", List.of()),
            new Case("[\"a\",null]", list("a")),
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
    void Oracle_스키마는_JSON이_아닌_값을_세_칸_모두_거부한다() {
        // 빈 문자열("")은 Oracle 이 NULL 로 저장해 CHECK 에 안 걸린다 — 목록에서 뺐다(null 입력과 같아 위 MATRIX 의 null 행이 덮는다).
        for (String raw : List.of("   ", "[\"a\"", "[\"a\",]", "[\"a\"] x", "abc", "배치")) {
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

    // ── JSON null 리터럴 / 빈 문자열 리터럴 — D1 수정(fix) 뒤 둘 다 빈 목록 ──

    @Test
    void D1_JSON_null_리터럴은_null이_아니라_빈_목록이_된다() {
        // D1 수정(fix): 예전에는 검색 결과 행·캐시 항목의 목록이 null 이었다.
        Long nullLiteral = seedRaw("null");
        Long emptyString = seedRaw("\"\"");
        cache.reloadAll();

        List<TermRow> rows = service.search(null).getList();
        assertEquals(nullLiteral, rows.get(0).getTermId());
        assertEquals(List.of(), rows.get(0).getSynonyms(), "검색 결과 행의 synonyms 는 빈 목록");
        assertEquals(List.of(), rows.get(0).getAliases());
        assertEquals(List.of(), rows.get(0).getSystems());
        assertEquals(List.of(), cache.get(nullLiteral).synonyms(), "캐시 항목의 synonyms 도 빈 목록");
        assertEquals(List.of(), cache.get(nullLiteral).aliases());
        assertEquals(List.of(), cache.get(nullLiteral).systems());
        assertEquals(emptyString, rows.get(1).getTermId());
        assertEquals(List.of(), rows.get(1).getSynonyms(), "JSON 빈 문자열 리터럴 \"\" 도 빈 목록이다");
        assertEquals(List.of(), cache.get(emptyString).synonyms());
    }

    @Test
    void D1_JSON_null_리터럴_행이_있어도_키워드_검색과_시스템_조건_검색은_NPE_없이_그_행을_빈_목록으로_판정한다() {
        // D1 수정(fix) 재현: 예전에는 목록이 null 이라 .stream() 에서 NPE 가 났다. DB 1차 거르기는 원문 null 행을 따로 남기지 않으므로,
        // 키워드를 "null" 로 둬 원문 글자(NULL)가 바늘에 걸리게 해 이 행을 Java 비교까지 오게 한다.
        seedRaw("null");
        TermSearchRequest byKeyword = new TermSearchRequest();
        byKeyword.setKeyword("null"); // 표기·약어에 안 맞아 동의어·별칭까지 본다
        assertEquals(List.of(), service.search(byKeyword).getList());

        Long mes = seedRaw("[\"MES\"]");
        TermSearchRequest bySystem = new TermSearchRequest();
        bySystem.setSystems("MES");
        assertEquals(List.of(mes), service.search(bySystem).getList().stream().map(TermRow::getTermId).toList());
    }

    @Test
    void D1_JSON_null_리터럴_행이_캐시에_있어도_1차_추천은_NPE_없이_다른_행을_찾는다() {
        // D1 수정(fix) 재현: 예전에는 CachedTerm.synonyms() 가 null 이라 for-each 에서 NPE 가 나, 그런 행이 하나만 있어도 모든 추천이
        // 실패했다.
        seedRaw("null");
        Long coil = termRepository.saveAndFlush(new MdmTerm("코일", ++senseSeq, "정의")).getTermId();
        cache.reloadAll();
        RecommendRequest request = new RecommendRequest();
        request.setTermName("코일");

        Map<String, Object> result = service.recommend(request);
        @SuppressWarnings("unchecked")
        List<RecommendCandidate> candidates = (List<RecommendCandidate>) (List<?>) result.get("candidates");
        assertTrue(candidates.stream().anyMatch(c -> coil.equals(c.getTermId()) && c.getScore() == 1.0d),
                candidates.toString());
    }

    @Test
    void D2_원소_null_동의어_행이_캐시에_있어도_1차_추천은_NPE_없이_다른_행을_찾는다() {
        // D2 수정(fix) 재현: 예전에는 CachedTerm.synonyms() 에 null 원소가 남아 TRAILING_PAREN.matcher(syn) 에서 NPE 가 나, 그런 행이
        // 캐시에 하나만 있어도 모든 추천이 실패했다. 이제 파서가 null 원소를 버린다.
        seedRaw("[null]");
        Long withSynonym = seedRaw("[null,\"코일\"]"); // null 원소 뒤의 동의어 "코일" 은 그대로 비교된다
        Long coil = termRepository.saveAndFlush(new MdmTerm("코일", ++senseSeq, "정의")).getTermId();
        cache.reloadAll();
        RecommendRequest request = new RecommendRequest();
        request.setTermName("코일");

        Map<String, Object> result = service.recommend(request);
        @SuppressWarnings("unchecked")
        List<RecommendCandidate> candidates = (List<RecommendCandidate>) (List<?>) result.get("candidates");
        assertTrue(candidates.stream().anyMatch(c -> coil.equals(c.getTermId()) && c.getScore() == 1.0d),
                candidates.toString());
        assertTrue(candidates.stream().anyMatch(c -> withSynonym.equals(c.getTermId()) && c.getScore() == 1.0d),
                candidates.toString());
    }

    @Test
    void 원소에_null이_있어도_키워드_검색은_그_원소만_건너뛴다() {
        // D2 수정(fix) 뒤로는 파서가 null 원소를 버려 결과 행의 동의어에도 null 이 없다(예전에는 비교만 건너뛰고 [null, 배치] 로 실렸다).
        Long id = seedRaw("[null,\"배치\"]");
        TermSearchRequest r = new TermSearchRequest();
        r.setKeyword("배치");
        List<TermRow> rows = service.search(r).getList();
        assertEquals(List.of(id), rows.stream().map(TermRow::getTermId).toList());
        assertEquals(List.of("배치"), rows.get(0).getSynonyms());
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
