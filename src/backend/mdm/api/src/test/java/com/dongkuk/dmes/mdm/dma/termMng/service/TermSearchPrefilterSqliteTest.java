package com.dongkuk.dmes.mdm.dma.termMng.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.termMng.TermRecommendationCache;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * {@link TermSearchPrefilter} 를 실제 SQLite 로 돌려 DB 1차 거르기가 행을 실제로 줄이는지 본다. 최종 결과가 같은지는
 * {@code TermMngSearchCharacterizationTest} 가 고정하므로, 여기서는 거르기가 아무것도 안 하는(조건 누락) 회귀를 막는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class TermSearchPrefilterSqliteTest extends AbstractMdmSharedDbTest {

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

    private Long seed(String termName, Consumer<MdmTerm> customizer) {
        MdmTerm t = new MdmTerm(termName, ++senseSeq, "정의-" + termName);
        customizer.accept(t);
        return termRepository.saveAndFlush(t).getTermId();
    }

    private List<Long> candidates(String keyword, String context) {
        return termRepository.findAll(TermSearchPrefilter.of(
                        keyword == null ? null : keyword.toUpperCase(Locale.ROOT),
                        context == null ? null : context.toUpperCase(Locale.ROOT)),
                        TermSearchPrefilter.ORDER).stream()
                .map(MdmTerm::getTermId).toList();
    }

    @Test
    void 키워드는_네_칸에서_거르고_JSON_칸의_역슬래시_행은_남기며_null_원문_행은_따로_남기지_않는다() {
        Long name = seed("코일", t -> { });
        Long abbr = seed("가", t -> t.setEngAbbr("xcoil"));
        Long syn = seed("나", t -> t.setSynonyms("[\"코일감기\"]"));
        Long alias = seed("다", t -> t.setAliases("[\"COIL_ID\"]"));
        Long escaped = seed("라", t -> t.setSynonyms("[\"\\uBC30\"]"));
        // 원문에 null 이 든 행도 일반 행처럼 거른다. 예전에는 Java 의 키워드 비교 NPE 를 1차 거르기 뒤에도 똑같이 내려고 남겼지만,
        // D1·D2 수정(fix) 뒤로 파서가 null 리터럴을 빈 목록으로 읽고 원소 null 을 버려 NPE 가 없다(TermSearchPrefilter 설명 참고).
        Long nullLiteral = seed("마", t -> t.setAliases("null"));
        seed("바", t -> t.setEngName("코일"));
        seed("사", t -> t.setSynonyms("[\"판\"]"));

        assertEquals(List.of(name, syn, escaped), candidates("코일", null));
        // "coil" → 안전 글자 구간 "CO"
        assertEquals(List.of(abbr, alias, escaped), candidates("coil", null));
        // 원문 글자로는 다른 행처럼 걸린다(최종 판정은 Java 가 빈 목록으로 보고 한다). 역슬래시 행은 늘 남는다
        assertEquals(List.of(escaped, nullLiteral), candidates("null", null));
        // 안전 글자가 없으면 거르지 않는다
        assertEquals(8, candidates("ss", null).size());
        assertEquals(8, candidates(null, null).size());
    }

    @Test
    void 퍼센트와_밑줄은_글자_그대로_거른다() {
        Long percent = seed("A%B", t -> { });
        Long underscore = seed("A_B", t -> { });
        seed("AXB", t -> { });

        assertEquals(List.of(percent), candidates("%", null));
        assertEquals(List.of(underscore), candidates("_", null));
    }

    @Test
    void 상황_조건은_시스템_원문에_null_이_든_행을_따로_남기지_않는다() {
        // 예전에는 시스템 조건이 있으면 이 행들을 남겼다 — Java 가 시스템 조건을 상황 조건보다 먼저 보는데 시스템 비교가 null 리터럴(D1)·
        // null 원소(D2)에서 NPE 를 냈기 때문이다. D1·D2 수정(fix) 뒤로 NPE 가 없어 상황 조건만으로 거른다. 그래서 거르기는 시스템 조건이
        // 있는지 받지 않는다.
        Long hot = seed("가", t -> t.setContext("열연"));
        seed("나", t -> {
            t.setContext("냉연");
            t.setSystems("null");
        });
        seed("다", t -> t.setContext("냉연"));
        seed("라", t -> {
            t.setContext("냉연");
            t.setSystems("[null]");
        });

        assertEquals(List.of(hot), candidates(null, "열연"));
    }

    @Test
    void 상황_조건은_키워드_조건이_있어도_동의어_별칭_원문에_null_이_든_행을_따로_남기지_않는다() {
        // 예전에는 키워드 조건이 있으면 이 행들을 남겼다(64bcf6cc) — 동의어·별칭이 null 리터럴이면 키워드 비교가 NPE 를 냈기 때문이다(D1).
        // D1 수정(fix) 뒤로 NPE 가 없어 상황 조건만으로 거른다.
        Long hot = seed("코일", t -> t.setContext("열연"));
        seed("가", t -> {
            t.setContext("냉연");
            t.setSynonyms("null");
        });
        seed("나", t -> {
            t.setContext("냉연");
            t.setAliases("null");
        });
        seed("다", t -> t.setContext("냉연"));

        assertEquals(List.of(hot), candidates(null, "열연"));
        assertEquals(List.of(hot), candidates("코일", "열연"));
        // 바늘 없는 키워드는 DB 에서 거르지 않으므로 상황 조건 하나만 남는다 — 상황 조건이 null 행을 빼는지는 이 사례가 가른다
        assertEquals(List.of(hot), candidates("ss", "열연"), "바늘 없는 키워드도 같다");
    }
}
