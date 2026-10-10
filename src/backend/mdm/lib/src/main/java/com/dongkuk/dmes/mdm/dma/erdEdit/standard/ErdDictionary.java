package com.dongkuk.dmes.mdm.dma.erdEdit.standard;

import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdNaming;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.naming.ColumnNameComposer;
import com.dongkuk.dmes.mdm.dma.naming.DomainEntry;
import com.dongkuk.dmes.mdm.dma.naming.DomainSuggester;
import com.dongkuk.dmes.mdm.dma.naming.NameComposition;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** 요청 하나 동안 쓰는 사전 묶음(계획 P3). 엔진에는 {@link ErdNaming} 으로 들어간다. */
public final class ErdDictionary implements ErdNaming {

    private final ColumnNameComposer composer;
    final Set<String> columnPhys;
    final Set<String> aliasPhys;
    private final Map<Long, ErdDomainSpec> domains;
    private final List<DomainEntry> domainEntries;

    /** 가져오기 논리명 채우기 재료(README S9). logical 은 컬럼 사전의 논리명(TB_MDM_COLUMN.COLUMN_NAME)이다. */
    public record ColumnEntry(String logical, Long domainId) {}
    /** 컬럼 사전 한 행. */
    public record ColumnRow(Long columnId, String phys, String logical, Long domainId) {}
    /** 시스템별 별칭 한 행(TB_MDM_COLUMN_SYSTEM). SYSTEM_CODE 는 보지 않는다(S9). */
    public record AliasRow(Long columnId, String phys) {}

    /** 대문자 물리명 → 컬럼 사전 항목. 컬럼 사전 물리명과 별칭 물리명을 모두 담는다. */
    private final Map<String, ColumnEntry> columnsByPhys;

    public ErdDictionary(TermDictionary terms, Set<String> columnPhys, Set<String> aliasPhys,
                         Map<Long, ErdDomainSpec> domains, List<DomainEntry> domainEntries) {
        this(terms, columnPhys, aliasPhys, domains, domainEntries, Map.of());
    }

    public ErdDictionary(TermDictionary terms, Set<String> columnPhys, Set<String> aliasPhys,
                         Map<Long, ErdDomainSpec> domains, List<DomainEntry> domainEntries,
                         Map<String, ColumnEntry> columnsByPhys) {
        this.composer = new ColumnNameComposer(terms);
        this.columnPhys = columnPhys;
        this.aliasPhys = aliasPhys;
        this.domains = domains;
        this.domainEntries = domainEntries;
        this.columnsByPhys = columnsByPhys;
    }

    @Override
    public Optional<NameComposition> forward(String logical) {
        return Optional.of(composer.forward(logical));
    }

    public NameComposition reverse(String phys) {
        return composer.reverse(phys);
    }

    /**
     * 물리명 색인(S9). 컬럼 사전 물리명이 먼저다. 별칭 물리명은 사전에 없을 때만 넣고, 같은 별칭이 여러 컬럼에 걸리면
     * COLUMN_ID 가 가장 작은 컬럼을 쓴다. 키는 대문자다(별칭 물리명은 대소문자가 섞여 있다).
     */
    public static Map<String, ColumnEntry> index(List<ColumnRow> columns, List<AliasRow> aliases) {
        Map<String, ColumnEntry> out = new HashMap<>();
        Map<Long, ColumnEntry> byId = new HashMap<>();
        // 대소문자만 다른 물리명이 겹치면 COLUMN_ID 가 가장 작은 컬럼이 이긴다(findAll 순서에 기대지 않는다).
        columns.stream().filter(c -> c.phys() != null && c.columnId() != null)
                .sorted(Comparator.comparing(ColumnRow::columnId))
                .forEach(c -> {
                    ColumnEntry e = new ColumnEntry(c.logical(), c.domainId());
                    out.putIfAbsent(c.phys().toUpperCase(Locale.ROOT), e);
                    byId.put(c.columnId(), e);
                });
        aliases.stream().filter(a -> a.phys() != null && a.columnId() != null)
                .sorted(Comparator.comparing(AliasRow::columnId))
                .forEach(a -> {
                    ColumnEntry e = byId.get(a.columnId());
                    if (e != null) out.putIfAbsent(a.phys().toUpperCase(Locale.ROOT), e);
                });
        return out;
    }

    /** 가져온 컬럼의 논리명·도메인(S9): 컬럼 사전 → 별칭 → 역분해(모르는 토막 ***, 도메인 없음). */
    public ColumnEntry fill(String phys) {
        ColumnEntry e = phys == null ? null : columnsByPhys.get(phys.toUpperCase(Locale.ROOT));
        if (e != null) return e;
        return new ColumnEntry(reverse(phys).logicalName(), null);
    }

    @Override
    public Optional<ErdDomainSpec> domain(Long domainId) {
        return Optional.ofNullable(domains.get(domainId));
    }

    @Override
    public Optional<ErdDomainSpec> recommendDomain(String physName) {
        DomainEntry rec = DomainSuggester.recommended(DomainSuggester.suggest(physName, domainEntries));
        return rec == null ? Optional.empty() : domain(rec.domainId());
    }

    @Override
    public List<ErdWarning> warnings(ErdModel model, List<String> columnIds) {
        List<ErdWarning> out = new ArrayList<>();
        ErdStandardJudge.judge(model, this, columnIds).forEach((id, st) -> {
            switch (st) {
                case MISS -> out.add(new ErdWarning("STD_MISS", id, "사전에 없는 단어가 있습니다(***)"));
                case DOMAIN -> out.add(new ErdWarning("STD_DOMAIN", id, "도메인의 타입·길이와 다릅니다"));
                case TYPE -> out.add(new ErdWarning("STD_TYPE", id, "같은 물리명의 다른 컬럼과 타입이 다릅니다"));
                case NEW -> out.add(new ErdWarning("STD_NEW", id, "컬럼 사전에 아직 없는 이름입니다"));
                default -> { }
            }
        });
        return out;
    }
}
