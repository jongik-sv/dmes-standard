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

    private List<Long> candidates(String keyword, String context, boolean systemsFiltered) {
        return termRepository.findAll(TermSearchPrefilter.of(
                        keyword == null ? null : keyword.toUpperCase(Locale.ROOT),
                        context == null ? null : context.toUpperCase(Locale.ROOT), systemsFiltered),
                        TermSearchPrefilter.ORDER).stream()
                .map(MdmTerm::getTermId).toList();
    }

    @Test
    void 키워드는_네_칸에서_거르고_JSON_칸의_역슬래시_null_행은_남긴다() {
        Long name = seed("코일", t -> { });
        Long abbr = seed("가", t -> t.setEngAbbr("xcoil"));
        Long syn = seed("나", t -> t.setSynonyms("[\"코일감기\"]"));
        Long alias = seed("다", t -> t.setAliases("[\"COIL_ID\"]"));
        Long escaped = seed("라", t -> t.setSynonyms("[\"\\uBC30\"]"));
        // 원문에 null 이 든 행은 남긴다. D1 수정(fix) 뒤로는 Java 가 null 리터럴을 빈 목록으로 보고 거르므로 남는 행만 늘 뿐이다
        // (TermSearchPrefilter 설명 참고 — D2 를 고칠 때 함께 뺀다).
        Long nullLiteral = seed("마", t -> t.setAliases("null"));
        seed("바", t -> t.setEngName("코일"));
        seed("사", t -> t.setSynonyms("[\"판\"]"));

        assertEquals(List.of(name, syn, escaped, nullLiteral), candidates("코일", null, false));
        // "coil" → 안전 글자 구간 "CO"
        assertEquals(List.of(abbr, alias, escaped, nullLiteral), candidates("coil", null, false));
        // 안전 글자가 없으면 거르지 않는다
        assertEquals(8, candidates("ss", null, false).size());
        assertEquals(8, candidates(null, null, false).size());
    }

    @Test
    void 퍼센트와_밑줄은_글자_그대로_거른다() {
        Long percent = seed("A%B", t -> { });
        Long underscore = seed("A_B", t -> { });
        seed("AXB", t -> { });

        assertEquals(List.of(percent), candidates("%", null, false));
        assertEquals(List.of(underscore), candidates("_", null, false));
    }

    @Test
    void 상황_조건은_시스템_조건이_있을_때만_null_시스템_행을_남긴다() {
        // 남기는 까닭은 null 원소([null], D2)다 — Java 의 시스템 비교가 NPE 를 내므로 상황 조건이 그 행을 미리 빼면 동작이 바뀐다.
        // null 리터럴 행은 D1 수정(fix) 뒤 NPE 없이 Java 가 거르지만, 같은 LIKE 조건에 함께 걸려 남는다.
        Long hot = seed("가", t -> t.setContext("열연"));
        Long nullSystems = seed("나", t -> {
            t.setContext("냉연");
            t.setSystems("null");
        });
        seed("다", t -> t.setContext("냉연"));
        Long nullElement = seed("라", t -> {
            t.setContext("냉연");
            t.setSystems("[null]");
        });

        assertEquals(List.of(hot), candidates(null, "열연", false));
        assertEquals(List.of(hot, nullSystems, nullElement), candidates(null, "열연", true));
    }

    @Test
    void 상황_조건은_키워드_조건이_있을_때만_null_동의어_별칭_행을_남긴다() {
        // D1 수정(fix) 뒤로 이 조건은 동치에 필요 없고 남는 행만 늘린다(동의어·별칭 비교는 NPE 가 없다). 변경을 작게 두려고 남겼고,
        // D2 를 고칠 때 함께 뺀다 — 그때 이 시험도 고친다.
        Long hot = seed("코일", t -> t.setContext("열연"));
        Long nullSynonyms = seed("가", t -> {
            t.setContext("냉연");
            t.setSynonyms("null");
        });
        Long nullAliases = seed("나", t -> {
            t.setContext("냉연");
            t.setAliases("null");
        });
        seed("다", t -> t.setContext("냉연"));

        assertEquals(List.of(hot), candidates(null, "열연", false));
        assertEquals(List.of(hot, nullSynonyms, nullAliases), candidates("코일", "열연", false));
        assertEquals(List.of(hot, nullSynonyms, nullAliases), candidates("ss", "열연", false), "바늘 없는 키워드도 같다");
    }
}
