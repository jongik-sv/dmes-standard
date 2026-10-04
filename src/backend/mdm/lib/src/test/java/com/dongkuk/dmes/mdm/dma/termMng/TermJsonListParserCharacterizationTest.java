package com.dongkuk.dmes.mdm.dma.termMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingRepository;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermRow;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSearchRequest;
import com.dongkuk.dmes.mdm.dma.termMng.service.TermMngService;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

/**
 * 용어 JSON 목록 파서 두 벌({@code TermMngService.readStringList}·{@code TermRecommendationCache.readStringList}, 둘 다 private)의
 * 특성 시험 — 가짜 저장소로 공개 경로({@code search}·{@code refresh}/{@code get})를 거쳐 고정한다.
 *
 * <p>SQLite 스키마의 json_valid CHECK 때문에 DB 에 넣을 수 없는 입력(빈 문자열·공백·깨진 JSON·뒤에 남은 글자)까지 여기서 고정한다.
 * DB 에 넣을 수 있는 입력은 api 의 {@code TermJsonListCharacterizationTest} 가 실제 SQLite 로 같은 결과를 고정한다.
 *
 * <p>두 파서는 같다: {@code new ObjectMapper().readValue(json, List<String>)}, null·공백(isBlank)·예외면 빈 목록. JSON {@code null}
 * 리터럴도 빈 목록이다(D1 수정(fix) — 예전에는 null). 숫자·불린 원소는 문자열로 바뀌고, 원소의 공백·빈 문자열은 그대로 남는다. 원소
 * null 은 버린다(D2 수정(fix) — 예전에는 null 원소로 남아 시스템 조건 검색·1차 추천이 NPE 를 냈다).
 */
class TermJsonListParserCharacterizationTest {

    /** 입력 원문 → 기대 결과. 결과 목록 자체는 null 이 아니다(D1 수정). */
    private record Case(String raw, List<String> expected) {
    }

    private static List<String> list(String... values) {
        return new ArrayList<>(Arrays.asList(values));
    }

    static final List<Case> MATRIX = List.of(
            new Case(null, List.of()),
            new Case("", List.of()),
            new Case("   ", List.of()),
            new Case("\t\n", List.of()),
            new Case("[]", List.of()),
            new Case("[\"a\",\"b\"]", list("a", "b")),
            new Case("  [ \"a\" , \"b\" ]  ", list("a", "b")),
            new Case("[\"a\",\"a\"]", list("a", "a")),
            // 깨진 JSON
            new Case("[\"a\"", List.of()),
            new Case("[\"a\",]", List.of()),
            new Case("abc", List.of()),
            new Case("배치", List.of()),
            // 배열 뒤에 남은 글자 — 앞의 배열만 읽는다(FAIL_ON_TRAILING_TOKENS 꺼짐)
            new Case("[\"a\"] x", list("a")),
            new Case("[\"a\"][\"b\"]", list("a")),
            // 배열이 아닌 JSON
            new Case("{\"a\":1}", List.of()),
            new Case("\"abc\"", List.of()),
            new Case("\"\"", List.of()),
            new Case("3", List.of()),
            new Case("true", List.of()),
            // D1 수정(fix): JSON null 리터럴은 빈 목록이다(예전에는 null 을 돌려줘 검색·추천이 NPE 를 냈다).
            new Case("null", List.of()),
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

    private static MdmTerm term(String raw) {
        MdmTerm t = new MdmTerm("행", 1, "정의");
        t.setSynonyms(raw);
        t.setAliases(raw);
        t.setSystems(raw);
        return t;
    }

    @Test
    void 검색_결과_행의_목록_칸() {
        MdmTermRepository repo = mock(MdmTermRepository.class);
        TermEmbeddingRepository embeddings = mock(TermEmbeddingRepository.class);
        TermMngService service = new TermMngService(repo, embeddings,
                new TermRecommendationCache(repo, embeddings), mock(TermEmbeddingEncoder.class));

        for (Case c : MATRIX) {
            when(repo.findAll(any(Specification.class), any(Sort.class))).thenReturn(List.of(term(c.raw())));
            List<TermRow> rows = service.search(null).getList();
            assertEquals(1, rows.size());
            String label = "입력=" + c.raw();
            assertEquals(c.expected(), rows.get(0).getSynonyms(), "synonyms " + label);
            assertEquals(c.expected(), rows.get(0).getAliases(), "aliases " + label);
            assertEquals(c.expected(), rows.get(0).getSystems(), "systems " + label);
        }
    }

    @Test
    void D1_null_리터럴_행도_키워드와_시스템_조건_검색에서_NPE_없이_빈_목록으로_판정한다() {
        // D1 수정(fix) 재현: 예전에는 세 칸이 null 이라 동의어 비교·시스템 비교의 .stream() 에서 NPE 가 났다.
        MdmTermRepository repo = mock(MdmTermRepository.class);
        TermEmbeddingRepository embeddings = mock(TermEmbeddingRepository.class);
        TermMngService service = new TermMngService(repo, embeddings,
                new TermRecommendationCache(repo, embeddings), mock(TermEmbeddingEncoder.class));
        when(repo.findAll(any(Specification.class), any(Sort.class))).thenReturn(List.of(term("null")));

        TermSearchRequest byKeyword = new TermSearchRequest();
        byKeyword.setKeyword("없는말"); // 표기("행")에 안 맞아 동의어·별칭까지 본다
        assertEquals(List.of(), service.search(byKeyword).getList());
        byKeyword.setKeyword("행");
        assertEquals(1, service.search(byKeyword).getList().size(), "표기로는 그대로 찾힌다");

        TermSearchRequest bySystem = new TermSearchRequest();
        bySystem.setSystems("MES");
        assertEquals(List.of(), service.search(bySystem).getList());
    }

    @Test
    void D2_원소_null_행도_시스템_조건_검색에서_NPE_없이_그_원소만_건너뛰고_판정한다() {
        // D2 수정(fix) 재현: 예전에는 시스템 목록에 null 원소가 남아 s.equalsIgnoreCase(systemsFilter) 에서 NPE 가 났다.
        MdmTermRepository repo = mock(MdmTermRepository.class);
        TermEmbeddingRepository embeddings = mock(TermEmbeddingRepository.class);
        TermMngService service = new TermMngService(repo, embeddings,
                new TermRecommendationCache(repo, embeddings), mock(TermEmbeddingEncoder.class));
        TermSearchRequest bySystem = new TermSearchRequest();
        bySystem.setSystems("MES");

        when(repo.findAll(any(Specification.class), any(Sort.class))).thenReturn(List.of(term("[null]")));
        assertEquals(List.of(), service.search(bySystem).getList(), "null 원소뿐이면 시스템 조건에 안 맞아 빠진다");

        when(repo.findAll(any(Specification.class), any(Sort.class))).thenReturn(List.of(term("[null,\"MES\"]")));
        List<TermRow> rows = service.search(bySystem).getList();
        assertEquals(1, rows.size(), "null 원소 뒤의 MES 로 찾힌다");
        assertEquals(List.of("MES"), rows.get(0).getSystems());
    }

    @Test
    void 추천_캐시_항목의_목록_칸() {
        MdmTermRepository repo = mock(MdmTermRepository.class);
        TermEmbeddingRepository embeddings = mock(TermEmbeddingRepository.class);
        TermRecommendationCache cache = new TermRecommendationCache(repo, embeddings);

        for (Case c : MATRIX) {
            when(repo.findById(1L)).thenReturn(Optional.of(term(c.raw())));
            cache.refresh(1L);
            TermRecommendationCache.CachedTerm cached = cache.get(1L);
            String label = "입력=" + c.raw();
            assertEquals(c.expected(), cached.synonyms(), "synonyms " + label);
            assertEquals(c.expected(), cached.aliases(), "aliases " + label);
            assertEquals(c.expected(), cached.systems(), "systems " + label);
        }
    }
}
