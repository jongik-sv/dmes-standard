package com.dongkuk.dmes.mdm.dma.support;

import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import com.dongkuk.dmes.mdm.dma.naming.TermEntry;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.ArrayList;
import java.util.List;

/**
 * 용어 표 전체 → {@link TermDictionary}(TSK-04-04 design.md §6.4). 컬럼 사전({@code columnMng})과 용어 인라인 등록 팝업
 * ({@code termRegPop})이 따로 두던 같은 사본을 하나로 모았다.
 *
 * <p>요청마다 새로 읽는다 — 캐시하지 않는다(불변 규칙 I26). {@code findAll()} 순서를 그대로 넘긴다(정렬하지 않는다).
 * {@code dma.naming} 은 DB 에 기대지 않는 순수 패키지라 이 읽기는 여기 둔다.
 */
public final class TermDictionaryLoader {

    private TermDictionaryLoader() {
    }

    public static TermDictionary load(MdmTermRepository termRepository) {
        List<TermEntry> entries = new ArrayList<>();
        for (MdmTerm t : termRepository.findAll()) {
            entries.add(new TermEntry(t.getTermId(), t.getTermName(), t.getSenseNo(), t.getDefinition(), t.getContext(),
                    t.getEngName(), t.getEngAbbr(), t.getSynonyms(), t.getAliases()));
        }
        return TermDictionary.of(entries);
    }
}
