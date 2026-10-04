package com.dongkuk.dmes.mdm.dma.termRegPop.service;

import static com.dongkuk.dmes.mdm.common.support.MdmStrings.trimToNull;
import static com.dongkuk.dmes.mdm.common.support.MdmErrors.invalid;

import com.dongkuk.dmes.mdm.common.security.MdmStdAdminGuard;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.naming.AbbrSuggester;
import com.dongkuk.dmes.mdm.dma.naming.AbbrSuggestion;
import com.dongkuk.dmes.mdm.dma.naming.NamingRules;
import com.dongkuk.dmes.mdm.dma.naming.SimilarTerm;
import com.dongkuk.dmes.mdm.dma.naming.SimilarTermFinder;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import com.dongkuk.dmes.mdm.dma.support.TermDictionaryLoader;
import com.dongkuk.dmes.mdm.dma.termRegPop.dto.TermRegPopRegRequest;
import com.dongkuk.dmes.mdm.dma.termRegPop.dto.TermRegPopSearchRequest;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * 용어 인라인 등록 팝업({@code termRegPop}) OASIS 진입 서비스(TSK-04-04 design.md §6.2·§6.13).
 *
 * <p>컬럼 사전 분해에서 {@code ***} 로 남은 자리를 메우는 최소 입력(표기·의미 번호·정의·맥락·영문명·약어)만 받는다.
 * 동의어·별칭·사용 시스템 입력과 임베딩 2차 추천은 TSK-04-02(용어 관리) 몫이다(F22). 등록 용어의 {@code EMBEDDING}
 * 은 NULL 로 남는다.
 *
 * <p>{@code @Transactional} 을 붙이지 않는다(F11). {@code reg} 는 표준 관리자만 한다(D1·I14). {@code search} 에는
 * 서버 역할 검사가 없다(I15).
 */
@Service("termRegPopService")
public class TermRegPopService {

    static final String SRC_ORIGIN = "MDM:columnMng";

    private final MdmTermRepository termRepository;
    private final MdmStdAdminGuard guard;

    public TermRegPopService(MdmTermRepository termRepository, MdmStdAdminGuard guard) {
        this.termRepository = termRepository;
        this.guard = guard;
    }

    // ── action: search ────────────────────────────────────────────────────

    /** 유사어 1차 문자열 추천(§6.9)·다음 의미 번호·약어 제안(engName 이 있을 때만, §6.10). */
    public Map<String, Object> search(TermRegPopSearchRequest request) {
        String termName = request == null || request.getTermName() == null ? "" : request.getTermName().trim();
        String engName = request == null || request.getEngName() == null ? "" : request.getEngName().trim();
        TermDictionary dict = TermDictionaryLoader.load(termRepository);

        List<Map<String, Object>> similar = new ArrayList<>();
        for (SimilarTerm s : SimilarTermFinder.find(termName, engName, dict)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("termId", s.term().termId());
            row.put("termName", s.term().termName());
            row.put("senseNo", s.term().senseNo());
            row.put("definition", s.term().definition());
            row.put("context", s.term().context());
            row.put("engName", s.term().engName());
            row.put("engAbbr", s.term().engAbbr());
            row.put("reason", s.reason());
            row.put("score", s.score());
            similar.add(row);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("similar", similar);
        out.put("nextSenseNo", nextSenseNo(termName));
        out.put("abbr", engName.isEmpty() ? null : abbrMap(AbbrSuggester.suggest(engName, dict.usedAbbrUpper())));
        return out;
    }

    // ── action: reg ───────────────────────────────────────────────────────

    /** 용어 등록(§6.13, 처리 순서 고정): 역할 → 입력 → (표기, 의미 번호) 중복 → 약어 중복(대소문자 무시) → 저장. */
    public Map<String, Object> reg(TermRegPopRegRequest request) {
        guard.requireStdAdmin();
        TermRegPopRegRequest req = request == null ? new TermRegPopRegRequest() : request;

        String termName = trim(req.getTermName());
        String definition = trim(req.getDefinition());
        String context = trimToNull(req.getContext());
        String engName = trimToNull(req.getEngName());
        String engAbbr = trim(req.getEngAbbr());
        Integer senseNo = req.getSenseNo();
        if (termName.isEmpty() || !NamingRules.TERM_NAME.matcher(termName).matches()) {
            throw invalid("표기는 한글·영문·숫자만 쓸 수 있습니다(공백·기호 불가)");
        }
        maxLength(termName, NamingRules.TERM_NAME_MAX, "표기");
        if (senseNo == null || senseNo < 1) {
            throw invalid("의미 번호는 1 이상이어야 합니다");
        }
        if (definition.isEmpty()) {
            throw invalid("정의는 필수입니다");
        }
        maxLength(context, NamingRules.CONTEXT_MAX, "맥락");
        maxLength(engName, NamingRules.ENG_NAME_MAX, "영문명");
        if (engAbbr.isEmpty() || !NamingRules.ENG_ABBR.matcher(engAbbr).matches()) {
            throw invalid("영문 약어는 영문 대문자로 시작하고 대문자·숫자를 밑줄로 이은 형식이어야 합니다");
        }
        maxLength(engAbbr, NamingRules.CODE_MAX, "영문 약어");

        if (termRepository.existsByTermNameAndSenseNo(termName, senseNo)) {
            throw MdmErrors.of(MdmErrorCode.TERM_DUPLICATED, termName + " 의미 " + senseNo + " 이(가) 이미 있습니다",
                    List.of());
        }
        TermDictionary dict = TermDictionaryLoader.load(termRepository);
        if (dict.usedAbbrUpper().contains(engAbbr.toUpperCase(Locale.ROOT))) {
            AbbrSuggestion alt = AbbrSuggester.suggest(engName != null ? engName : engAbbr, dict.usedAbbrUpper());
            String detail = "약어 " + engAbbr + " 사용 중"
                    + (alt.alternatives().isEmpty() ? "" : ". 대안 " + String.join(", ", alt.alternatives()));
            throw MdmErrors.of(MdmErrorCode.TERM_DUPLICATED, detail, List.of());
        }

        MdmTerm term = new MdmTerm(termName, senseNo, definition);
        term.setContext(context);
        term.setEngName(engName);
        term.setEngAbbr(engAbbr);
        term.setSrcOrigin(SRC_ORIGIN);
        term = termRepository.save(term);

        Map<String, Object> saved = new LinkedHashMap<>();
        saved.put("termId", term.getTermId());
        saved.put("termName", term.getTermName());
        saved.put("senseNo", term.getSenseNo());
        saved.put("engAbbr", term.getEngAbbr());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("term", saved);
        return out;
    }

    // ── 보조 ──────────────────────────────────────────────────────────────

    private int nextSenseNo(String termName) {
        if (termName.isEmpty()) {
            return 1;
        }
        return termRepository.findByTermName(termName).stream().mapToInt(MdmTerm::getSenseNo).max().orElse(0) + 1;
    }

    private static Map<String, Object> abbrMap(AbbrSuggestion s) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("base", s.base());
        row.put("baseTaken", s.baseTaken());
        row.put("suggested", s.suggested());
        row.put("alternatives", s.alternatives());
        return row;
    }

    private static void maxLength(String value, int max, String label) {
        if (value != null && NamingRules.length(value) > max) {
            throw invalid(label + "은(는) " + max + "자 이하여야 합니다");
        }
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
