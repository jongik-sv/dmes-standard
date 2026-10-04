package com.dongkuk.dmes.mdm.dma.termMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermRow;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSearchRequest;
import com.dongkuk.dmes.mdm.dma.termMng.service.TermMngService;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.List;
import java.util.function.Consumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * 용어 검색({@code TermMngService.search}) 특성 시험 — 리팩토링(키워드·상황 조건 SQL LIKE 1차 거르기) 전에 지금 동작을 고정한다.
 *
 * <p>지금 동작 요약(이 시험이 고정하는 것):
 * <ul>
 *   <li>키워드는 {@code String.trim()} 뒤 비면 조건 없음. 비교 필드는 표기(TERM_NAME)·영문 약어(ENG_ABBR)·동의어(SYNONYMS 원소)·
 *       별칭(ALIASES 원소) 넷뿐이다 — 영문명(ENG_NAME)·정의·상황·근거·시스템은 키워드로 찾지 않는다.</li>
 *   <li>비교는 Java {@code toUpperCase(Locale.ROOT)} 뒤 부분 포함이다. 그래서 ASCII 밖 문자(라틴 확장·키릴·전각·ß)도 대소문자를
 *       무시한다. {@code %}·{@code _}·{@code \} 는 글자 그대로다.</li>
 *   <li>JSON 목록 칸은 파싱한 원소 값으로 비교한다 — {@code \\uXXXX} 이스케이프로 저장돼도 찾히고, 배열이 아닌 JSON 은 원문에 키워드가 있어도
 *       안 찾힌다. 깨진 JSON 은 SQLite 스키마의 json_valid CHECK 가 막아 DB 에 없다.</li>
 *   <li>시스템 조건은 원소 전체 일치(대소문자 무시), 상황 조건은 부분 포함(대소문자 무시)이다. 세 조건은 AND 다.</li>
 *   <li>정렬은 쿼리에 ORDER BY 가 없는 {@code findAll()} 순서 — SQLite 에서 TERM_ID 오름차순이다.</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class TermMngSearchCharacterizationTest extends AbstractMdmSharedDbTest {

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

    /** 원문 그대로의 칸 값으로 한 행을 넣는다(서비스 save 를 거치지 않아 JSON 원문을 마음대로 고를 수 있다). */
    private Long seed(String termName, Consumer<MdmTerm> customizer) {
        MdmTerm t = new MdmTerm(termName, ++senseSeq, "정의-" + termName);
        customizer.accept(t);
        return termRepository.saveAndFlush(t).getTermId();
    }

    private Long seed(String termName) {
        return seed(termName, t -> { });
    }

    private List<Long> ids(TermSearchRequest request) {
        return service.search(request).getList().stream().map(TermRow::getTermId).toList();
    }

    private List<Long> keyword(String keyword) {
        TermSearchRequest r = new TermSearchRequest();
        r.setKeyword(keyword);
        return ids(r);
    }

    private List<Long> filter(String keyword, String systems, String context) {
        TermSearchRequest r = new TermSearchRequest();
        r.setKeyword(keyword);
        r.setSystems(systems);
        r.setContext(context);
        return ids(r);
    }

    // ── 조건 없음·정렬·건수 ──

    @Test
    void 조건이_없으면_전체를_TERM_ID_오름차순으로_돌려준다() {
        Long da = seed("다람쥐");
        Long ga = seed("가나");
        Long na = seed("나비");
        // 앞 행을 고쳐도(갱신) 순서는 TERM_ID 그대로다.
        MdmTerm first = termRepository.findById(da).orElseThrow();
        first.setDefinition("고친 정의");
        termRepository.saveAndFlush(first);

        List<Long> expected = List.of(da, ga, na);
        assertEquals(expected, ids(null), "요청 자체가 null");
        assertEquals(expected, ids(new TermSearchRequest()), "빈 요청");
        assertEquals(expected, keyword(""), "빈 키워드");
        assertEquals(expected, keyword("   "), "공백만 있는 키워드는 trim 뒤 조건 없음");
        assertEquals(expected, filter(" ", " ", " "), "세 조건 모두 공백");
        assertEquals(3, service.search(null).getList().size());
    }

    @Test
    void 결과는_일치한_행만_TERM_ID_오름차순이다() {
        Long z = seed("하코일");
        seed("무관");
        Long a = seed("가코일");
        Long m = seed("마", t -> t.setEngAbbr("COIL"));
        assertEquals(List.of(z, a), keyword("코일"));
        assertEquals(List.of(m), keyword("coil"));
    }

    @Test
    void 행_전체_칸이_결과_행에_그대로_실린다() {
        Long id = seed("코일", t -> {
            t.setContext("열연 공정");
            t.setEngName("Coil");
            t.setEngAbbr("COIL");
            t.setSynonyms("[\"배치(ERP)\",\"뱃치\"]");
            t.setAliases("[\"코일ID\"]");
            t.setSystems("[\"MES\",\"ERP\"]");
            t.setStdBasis("근거");
        });
        TermRow row = service.search(null).getList().get(0);
        assertEquals(id, row.getTermId());
        assertEquals("코일", row.getTermName());
        assertEquals(1, row.getSenseNo());
        assertEquals("정의-코일", row.getDefinition());
        assertEquals("열연 공정", row.getContext());
        assertEquals("Coil", row.getEngName());
        assertEquals("COIL", row.getEngAbbr());
        assertEquals(List.of("배치(ERP)", "뱃치"), row.getSynonyms());
        assertEquals(List.of("코일ID"), row.getAliases());
        assertEquals(List.of("MES", "ERP"), row.getSystems());
        assertEquals("근거", row.getStdBasis());
    }

    // ── 키워드 비교 필드 ──

    @Test
    void 키워드는_표기_약어_동의어_별칭_네_칸만_비교한다() {
        Long byName = seed("QZXA표기");
        Long byAbbr = seed("약어행", t -> t.setEngAbbr("QZXA"));
        Long bySynonym = seed("동의어행", t -> t.setSynonyms("[\"다른것\",\"qzxa동의\"]"));
        Long byAlias = seed("별칭행", t -> t.setAliases("[\"별칭QZXA\"]"));
        seed("영문명행", t -> t.setEngName("QZXA Name"));
        MdmTerm defRow = new MdmTerm("정의행", ++senseSeq, "QZXA 가 들어간 정의");
        termRepository.saveAndFlush(defRow);
        seed("상황행", t -> t.setContext("QZXA 상황"));
        seed("근거행", t -> t.setStdBasis("QZXA 근거"));
        seed("시스템행", t -> t.setSystems("[\"QZXA\"]"));

        assertEquals(List.of(byName, byAbbr, bySynonym, byAlias), keyword("QZXA"));
    }

    @Test
    void 동의어의_괄호_시스템_표기도_원문_그대로_비교한다() {
        Long id = seed("배치행", t -> t.setSynonyms("[\"뱃치(ERP)\"]"));
        assertEquals(List.of(id), keyword("ERP"), "괄호 안 시스템명도 동의어 원문의 일부라 찾힌다");
        assertEquals(List.of(id), keyword("치(E"));
    }

    // ── 대소문자 ──

    @Test
    void ASCII_대소문자는_무시한다() {
        Long name = seed("COIL반");
        Long abbr = seed("약어", t -> t.setEngAbbr("Coil"));
        Long syn = seed("동의어", t -> t.setSynonyms("[\"cOiL\"]"));
        Long alias = seed("별칭", t -> t.setAliases("[\"coil_id\"]"));

        List<Long> all = List.of(name, abbr, syn, alias);
        assertEquals(all, keyword("coil"));
        assertEquals(all, keyword("COIL"));
        assertEquals(all, keyword("CoIl"));
    }

    @Test
    void ASCII_밖_문자도_Java_대문자_변환으로_대소문자를_무시한다() {
        Long latin = seed("ÄRGER");
        Long cyrillic = seed("МЕТАЛЛ");
        Long fullwidth = seed("ＣＯＩＬ");
        Long sharpS = seed("Straße");
        Long greek = seed("ΩΜΕΓΑ");

        assertEquals(List.of(latin), keyword("ärger"));
        assertEquals(List.of(cyrillic), keyword("металл"));
        assertEquals(List.of(fullwidth), keyword("ｃｏｉｌ"));
        assertEquals(List.of(greek), keyword("ωμεγα"));
        // ß 는 대문자로 SS 가 된다 — 표기 "Straße" 는 "STRASSE"·"strasse"·"straße" 어느 것으로도 찾힌다.
        assertEquals(List.of(sharpS), keyword("STRASSE"));
        assertEquals(List.of(sharpS), keyword("strasse"));
        assertEquals(List.of(sharpS), keyword("straße"));
    }

    // ── 한글·공백 ──

    @Test
    void 한글_키워드는_부분_포함으로_찾는다() {
        Long a = seed("배치번호");
        Long b = seed("코일", t -> t.setSynonyms("[\"배치(ERP)\"]"));
        Long c = seed("로트", t -> t.setAliases("[\"생산배치\"]"));
        seed("뱃치");

        assertEquals(List.of(a, b, c), keyword("배치"));
        assertEquals(List.of(a), keyword("치번"));
        assertEquals(List.of(), keyword("배치번호들"));
    }

    @Test
    void 키워드_앞뒤_ASCII_공백과_제어문자는_자르고_가운데_공백은_그대로_비교한다() {
        Long spaced = seed("작업 지시");
        Long joined = seed("작업지시");

        assertEquals(List.of(spaced, joined), keyword("  작업  "));
        assertEquals(List.of(spaced, joined), keyword("\t작업\n"));
        assertEquals(List.of(spaced), keyword("작업 지시"));
        assertEquals(List.of(joined), keyword("작업지시"));
        assertEquals(List.of(), keyword("작업  지시"), "가운데 공백 두 칸은 한 칸과 다르다");
    }

    @Test
    void 전각_공백과_NBSP는_trim_되지_않아_키워드의_일부가_된다() {
        Long plain = seed("코일");
        Long ideographic = seed("　코일");
        Long nbsp = seed("코일 ");

        assertEquals(List.of(plain, ideographic, nbsp), keyword("코일"));
        assertEquals(List.of(ideographic), keyword("　코일"), "U+3000 은 String.trim 대상이 아니다");
        assertEquals(List.of(nbsp), keyword("코일 "), "NBSP 도 String.trim 대상이 아니다");
        assertEquals(List.of(), keyword("　　"), "전각 공백만 있어도 조건 없음이 아니다");
    }

    // ── 특수 문자 ──

    @Test
    void 퍼센트_밑줄_역슬래시는_글자_그대로_비교한다() {
        Long percent = seed("A%B");
        Long underscore = seed("A_B");
        Long plain = seed("AXB");
        Long backslash = seed("A\\B");

        assertEquals(List.of(percent), keyword("%"));
        assertEquals(List.of(underscore), keyword("_"));
        assertEquals(List.of(underscore), keyword("A_B"), "밑줄이 한 글자 와일드카드가 아니다");
        assertEquals(List.of(percent), keyword("A%"));
        assertEquals(List.of(backslash), keyword("\\"));
        assertEquals(List.of(), keyword("%%"));
        assertEquals(List.of(percent, underscore, plain, backslash), keyword("a"));
    }

    @Test
    void JSON_칸의_따옴표_역슬래시는_파싱한_값으로_비교한다() {
        Long quote = seed("따옴행", t -> t.setSynonyms("[\"따옴\\\"표\"]"));
        Long slash = seed("역슬행", t -> t.setAliases("[\"역\\\\슬래시\"]"));

        assertEquals(List.of(quote), keyword("옴\"표"));
        assertEquals(List.of(slash), keyword("역\\슬"));
        assertEquals(List.of(), keyword("\\\""), "저장 원문의 이스케이프 열(\\\")로는 찾히지 않는다");
        assertEquals(List.of(), keyword("\\\\"), "저장 원문의 이스케이프 열(\\\\)로는 찾히지 않는다");
    }

    @Test
    void 유니코드_이스케이프로_저장된_JSON_원소도_디코드한_값으로_찾는다() {
        Long escaped = seed("이스케이프행", t -> t.setSynonyms("[\"\\uBC30\\uCE58\"]"));

        assertEquals(List.of(escaped), keyword("배치"));
        assertEquals(List.of(), keyword("BC30"), "이스케이프 원문 글자로는 찾히지 않는다");
        assertEquals(List.of("배치"), service.search(null).getList().get(0).getSynonyms());
    }

    @Test
    void JSON_칸은_원문이_아니라_원소_값으로_비교한다() {
        // SQLite 스키마가 깨진 JSON 을 거부하므로(json_valid CHECK) DB 경로의 "깨진 JSON" 은 없다. 대신 JSON 이지만 문자열 배열이
        // 아닌 값(객체·숫자 원소 배열)은 원문에 키워드가 있어도 원소 값 비교에서 빠지거나(객체) 문자열로 바뀌어 비교된다(숫자).
        seed("객체행", t -> t.setSynonyms("{\"배치\":1}"));
        seed("객체원소행", t -> t.setSynonyms("[{\"name\":\"배치\"}]"));
        Long ok = seed("정상행", t -> t.setSynonyms("[\"배치\"]"));
        Long number = seed("숫자행", t -> t.setSynonyms("[2026]"));

        assertEquals(List.of(ok), keyword("배치"));
        assertEquals(List.of(number), keyword("202"));
        assertEquals(List.of(), keyword("name"), "원문의 키 이름으로는 찾히지 않는다");
    }

    @Test
    void ASCII_밖_원본이_대문자로_ASCII가_되어도_찾는다() {
        // ß 말고도 ſ(긴 s)·ı(점 없는 i)·ﬁ·ﬃ(합자)는 Java 대문자 변환으로 ASCII 가 된다. DB UPPER 는 이렇게 바꾸지 않는다.
        Long longS = seed("ſtate");
        Long dotless = seed("약어행", t -> t.setEngAbbr("ıd"));
        Long ligature = seed("동의어행", t -> t.setSynonyms("[\"ﬁle\"]"));
        Long ffi = seed("별칭행", t -> t.setAliases("[\"oﬃce\"]"));
        Long ctx = seed("상황행", t -> t.setContext("ﬁ"));

        assertEquals(List.of(longS), keyword("STATE"));
        assertEquals(List.of(longS), keyword("st"));
        assertEquals(List.of(dotless), keyword("id"));
        assertEquals(List.of(ligature), keyword("FILE"));
        assertEquals(List.of(ligature, ffi), keyword("fi"));
        assertEquals(List.of(ffi), keyword("OFFICE"));
        assertEquals(List.of(ctx), filter(null, null, "FI"));
    }

    @Test
    void 느낌표와_퍼센트_밑줄이_섞인_키워드도_글자_그대로_비교한다() {
        Long bang = seed("A!B");
        Long bangPercent = seed("C!%D");
        Long bangUnderscore = seed("동의어행", t -> t.setSynonyms("[\"E!_F\"]"));
        Long plain = seed("AXB");

        assertEquals(List.of(bang, bangPercent, bangUnderscore), keyword("!"));
        assertEquals(List.of(bang), keyword("a!b"));
        assertEquals(List.of(bangPercent), keyword("!%"));
        assertEquals(List.of(bangUnderscore), keyword("!_"));
        assertEquals(List.of(), keyword("!!"));
        assertEquals(List.of(), keyword("A!X"));
        assertEquals(List.of(plain), keyword("AX"));
    }

    @Test
    void D1_시스템이_null_리터럴인_행은_시스템_조건에서_NPE_없이_빠진다() {
        // D1 수정(fix): 예전에는 시스템 칸이 JSON null 리터럴이면 목록이 null 이라, 상황이 달라도 시스템 비교에서 NPE 가 났다.
        // 이제 빈 목록이라 시스템 조건에 안 맞아 빠진다.
        seed("널시스템", t -> {
            t.setSystems("null");
            t.setContext("냉연");
        });
        assertEquals(List.of(), filter(null, "MES", "열연"));
        assertEquals(List.of(), filter(null, "MES", "냉연"), "상황이 맞아도 시스템 조건에서 빠진다");
        assertEquals(List.of(), filter(null, null, "열연"), "시스템 조건이 없으면 상황 조건으로 빠진다");
    }

    @Test
    void 상황_조건에_안_맞는_행도_시스템_null_원소의_NPE는_그대로_난다() {
        // 기존 결함 고정(D2): Java 는 시스템 조건을 상황 조건보다 먼저 본다. 시스템 칸에 null 원소가 있으면 상황이 달라도 NPE.
        // DB 1차 거르기가 시스템 원문에 null 이 든 행을 남겨야 이 동작이 지켜진다.
        seed("널원소시스템", t -> {
            t.setSystems("[null]");
            t.setContext("냉연");
        });
        assertThrows(NullPointerException.class, () -> filter(null, "MES", "열연"));
        assertEquals(List.of(), filter(null, null, "열연"), "시스템 조건이 없으면 NPE 없이 빈 결과");
    }

    @Test
    void D1_동의어가_null_리터럴인_행은_키워드_비교에서_NPE_없이_빠진다() {
        // D1 수정(fix): 예전에는 표기·약어가 안 맞고 동의어가 JSON null 리터럴이면 상황이 달라도 NPE 가 났다. 이제 빈 목록이다.
        Long pan = seed("판", t -> {
            t.setSynonyms("null");
            t.setContext("냉연");
        });
        assertEquals(List.of(), filter("코일", null, "열연"));
        assertEquals(List.of(), filter("ss", null, "열연"), "DB 에서 거를 바늘이 없는 키워드도 같다");
        assertEquals(List.of(), filter("코일", null, "냉연"), "상황이 맞아도 키워드에 안 맞으면 빠진다");
        assertEquals(List.of(pan), filter("판", null, "냉연"), "표기로는 그대로 찾힌다");
    }

    @Test
    void D1_별칭이_null_리터럴인_행은_키워드_비교에서_NPE_없이_빠진다() {
        // D1 수정(fix): 동의어에 안 맞으면 별칭을 본다 — 예전에는 별칭이 JSON null 리터럴이면 NPE 가 났다. 이제 빈 목록이다.
        Long id = seed("널별칭", t -> {
            t.setSynonyms("[\"다른말\"]");
            t.setAliases("null");
            t.setContext("냉연");
        });
        assertEquals(List.of(), filter("코일", null, "열연"));
        assertEquals(List.of(), filter("코일", null, "냉연"));
        assertEquals(List.of(), filter("다른", null, "열연"), "동의어가 맞아도 상황이 다르면 빠진다");
        assertEquals(List.of(id), filter("다른", null, "냉연"));
    }

    // ── 시스템 조건 ──

    @Test
    void 시스템_조건은_원소_전체_일치이고_대소문자만_무시한다() {
        Long mesErp = seed("가", t -> t.setSystems("[\"MES\",\"erp\"]"));
        seed("나", t -> t.setSystems("[\" MES \"]")); // 저장 원소 앞뒤 공백 — 어떤 조건으로도 안 찾힌다
        Long mesx = seed("다", t -> t.setSystems("[\"MESX\"]"));
        seed("라");
        seed("마", t -> t.setSystems("{\"MES\":1}"));

        assertEquals(List.of(mesErp), filter(null, "mes", null));
        assertEquals(List.of(mesErp), filter(null, "ERP", null));
        assertEquals(List.of(mesErp), filter(null, "  MES  ", null), "조건 값은 trim 하지만 저장된 원소는 trim 하지 않는다");
        assertEquals(List.of(), filter(null, "ME", null), "부분 일치는 아니다");
        assertEquals(List.of(mesx), filter(null, "mesx", null));
        assertEquals(List.of(), filter(null, "MES,ERP", null), "콤마로 여러 값을 주면 그 글자 그대로 한 원소와 비교한다");
        assertEquals(5, filter(null, null, null).size());
        assertEquals(List.of(), filter(null, "\" MES \"", null));
    }

    @Test
    void 시스템_JSON에_null_원소가_있으면_시스템_조건_검색이_NPE로_실패한다() {
        // 기존 결함 고정: readStringList 가 [null] 을 null 원소 목록으로 돌려주고 s.equalsIgnoreCase 가 NPE.
        seed("널시스템", t -> t.setSystems("[null]"));
        assertThrows(NullPointerException.class, () -> filter(null, "MES", null));
    }

    // ── 상황 조건 ──

    @Test
    void 상황_조건은_부분_포함이고_대소문자를_무시하며_상황이_없는_행은_빠진다() {
        Long a = seed("가", t -> t.setContext("생산 MES 공정"));
        Long b = seed("나", t -> t.setContext("mes"));
        seed("다");
        Long d = seed("라", t -> t.setContext("품질%검사_공정"));

        assertEquals(List.of(a, b), filter(null, null, "Mes"));
        assertEquals(List.of(a), filter(null, null, " MES 공 "), "조건 값은 trim 하고 가운데 공백은 그대로다");
        assertEquals(List.of(d), filter(null, null, "%"));
        assertEquals(List.of(d), filter(null, null, "_"));
        assertEquals(List.of(), filter(null, null, "검사공정"));
    }

    @Test
    void 세_조건은_AND로_묶인다() {
        Long hit = seed("코일", t -> {
            t.setSystems("[\"MES\"]");
            t.setContext("열연");
        });
        seed("코일두께", t -> {
            t.setSystems("[\"ERP\"]");
            t.setContext("열연");
        });
        seed("코일폭", t -> {
            t.setSystems("[\"MES\"]");
            t.setContext("냉연");
        });
        seed("판", t -> {
            t.setSystems("[\"MES\"]");
            t.setContext("열연");
        });

        assertEquals(List.of(hit), filter("코일", "mes", "열연"));
        assertEquals(3, filter("코일", null, null).size());
        assertEquals(2, filter(null, "MES", "열연").size());
    }
}
