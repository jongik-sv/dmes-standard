package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeReader;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmColumnSystem;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.BizExpr;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.CodeRefMeta;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.ColumnMeta;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.DomainMeta;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.DomainRef;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedPayloads.Expr;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmColumnSystemRepository;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.domain.EffectiveExpressions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 컬럼·도메인 메타 조립(spec 2026-10-02-mdm-meta-cache-design §3.4·§4.2·§4.3) — 컬럼 하나의 운영 조립은 이것이 처음이다.
 * 규칙은 {@code DomainTestCaseRunner.definition} 을 따른다: 표준식은 {@code chainStdExpr}(CODE 의 MASTER 식은 엔진 검증기가 스스로 붙인다),
 * 비즈니스식·요구 변수·코드 참조·타입·소수 자리는 {@link EffectiveDomainView}. 테이블 칼럼(REQUIRED·DEFAULT_VALUE·REF_*·표시명·설명)을 더한다.
 * 도메인이 없거나(V16 이후 nullable) 체인이 순환이면 도메인 칸을 비운다(Ruling R3, {@code LayoutDictionary.derive} 선례).
 */
@Component
public class MetaFeedDictionary {

    private static final Logger log = LoggerFactory.getLogger(MetaFeedDictionary.class);

    private final MdmColumnRepository columns;
    private final MdmColumnSystemRepository columnSystems;
    private final DomainTreeReader reader;
    private final DomainChainAssembler assembler;

    public MetaFeedDictionary(MdmColumnRepository columns, MdmColumnSystemRepository columnSystems, DomainTreeReader reader,
                              DomainChainAssembler assembler) {
        this.columns = columns;
        this.columnSystems = columnSystems;
        this.reader = reader;
        this.assembler = assembler;
    }

    /** 키 = 대문자 물리명. 없는 컬럼은 빠진다. 별칭 매칭은 하지 않는다. */
    public MetaFeedResult columns(Collection<String> physNames) {
        return columns(physNames, null);
    }

    /**
     * 키 = 대문자 이름(spec 2026-10-03-mdm-column-system-alias-design L1·L3·L4). 표준 물리명이 먼저다. 표준으로 못 찾은 키는 {@code systemCode}
     * 가 있을 때만 그 시스템의 별칭({@code TB_MDM_COLUMN_SYSTEM.PHYS_NAME}, 대소문자 무시)으로 찾는다. 한 별칭이 서로 다른 컬럼을 가리키면
     * 모호해서 빠지고(없음) WARN 을 남긴다. 키 수와 무관하게 표준 1·별칭 1·컬럼 1 문장이다(도메인 트리 읽기 별도).
     */
    public MetaFeedResult columns(Collection<String> physNames, String systemCode) {
        if (physNames.isEmpty()) {
            return MetaFeedResult.empty();
        }
        DomainTreeSnapshot snapshot = reader.load();
        Map<String, Object> found = new LinkedHashMap<>();
        for (MdmColumn c : columns.findByPhysNameIn(physNames)) {
            found.put(c.getPhysName().toUpperCase(Locale.ROOT),
                    MetaFeedJson.plain(columnMeta(c, chain(snapshot, c.getDomainId()), null, null)));
        }
        String system = systemCode == null ? "" : systemCode.trim();
        List<String> rest = physNames.stream().filter(k -> !found.containsKey(k)).distinct().toList();
        if (!system.isEmpty() && !rest.isEmpty()) {
            Map<String, MdmColumnSystem> byKey = aliasMatches(system, rest);
            Map<Long, MdmColumn> byId = new HashMap<>();
            if (!byKey.isEmpty()) {
                columns.findAllById(byKey.values().stream().map(MdmColumnSystem::getColumnId).distinct().toList())
                        .forEach(c -> byId.put(c.getColumnId(), c));
            }
            for (String key : rest) {
                MdmColumnSystem alias = byKey.get(key);
                MdmColumn c = alias == null ? null : byId.get(alias.getColumnId());
                if (c != null) {
                    found.put(key, MetaFeedJson.plain(
                            columnMeta(c, chain(snapshot, c.getDomainId()), alias.getSystemCode(), alias.getPhysName())));
                }
            }
        }
        // 응답은 요청 키 순서로(표준·별칭이 섞여도)
        Map<String, Object> ordered = new LinkedHashMap<>();
        for (String key : physNames) {
            Object v = found.get(key);
            if (v != null) {
                ordered.put(key, v);
            }
        }
        return new MetaFeedResult(ordered, Map.of());
    }

    /**
     * 키별로 맞은 별칭 행 하나. 서로 다른 COLUMN_ID 를 가리키는 키는 빠진다(모호, WARN). 한 컬럼에 대소문자만 다른 별칭이 여럿이면 키와 글자까지
     * 같은 원문을, 없으면 원문 사전순 첫 값을 고른다(응답이 늘 같게).
     */
    private Map<String, MdmColumnSystem> aliasMatches(String system, List<String> keys) {
        Map<String, List<MdmColumnSystem>> grouped = new LinkedHashMap<>();
        for (MdmColumnSystem row : columnSystems.findBySystemCodeAndUpperPhysNameIn(system, keys)) {
            grouped.computeIfAbsent(row.getPhysName().toUpperCase(Locale.ROOT), k -> new ArrayList<>()).add(row);
        }
        Map<String, MdmColumnSystem> out = new LinkedHashMap<>();
        grouped.forEach((key, rows) -> {
            List<Long> ids = rows.stream().map(MdmColumnSystem::getColumnId).distinct().sorted().toList();
            if (ids.size() > 1) {
                log.warn("MDM 컬럼 별칭이 모호해서 찾지 않습니다: system={}, key={}, columnIds={}", system, key, ids);
                return;
            }
            out.put(key, rows.stream()
                    .min(Comparator.comparing((MdmColumnSystem r) -> !r.getPhysName().equals(key))
                            .thenComparing(MdmColumnSystem::getPhysName))
                    .orElseThrow());
        });
        return out;
    }

    /** 키 = DOMAIN_ID 문자열. 숫자가 아니거나 없는 키는 빠지고, 상속이 순환이면 failed 다. */
    public MetaFeedResult domains(Collection<String> domainIds) {
        if (domainIds.isEmpty()) {
            return MetaFeedResult.empty();
        }
        DomainTreeSnapshot snapshot = reader.load();
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (String key : domainIds) {
            Long id = parseId(key);
            if (id == null || snapshot.find(id).isEmpty()) {
                continue;
            }
            Chain chain = chain(snapshot, id);
            if (chain == null) {
                failed.put(key, "도메인 상속이 순환합니다: " + key);
                continue;
            }
            found.put(key, MetaFeedJson.plain(domainMeta(chain)));
        }
        return new MetaFeedResult(found, failed);
    }

    /** 최상위 조상부터 자신까지와 그 조립 결과. */
    record Chain(List<DomainNode> nodes, EffectiveDomainView view) {

        DomainNode self() {
            return nodes.get(nodes.size() - 1);
        }

        /** {@code chainStdExpr} 의 AST — 조상~자신의 자기 AST 를 왼쪽 중첩 AND 로(엔진 조립과 같다, 다시 파싱하지 않는다). */
        Map<String, Object> chainStdAst() {
            return EffectiveExpressions.ast(nodes.stream().map(n -> n.stdRule() == null ? null : n.stdAst()).toList());
        }
    }

    private Chain chain(DomainTreeSnapshot snapshot, Long domainId) {
        if (domainId == null || snapshot.find(domainId).isEmpty()) {
            return null;
        }
        try {
            List<DomainNode> nodes = snapshot.chainRootFirst(domainId);
            return new Chain(nodes, assembler.assemble(nodes));
        } catch (DomainTreeSnapshot.CycleException | IllegalArgumentException e) {
            return null;
        }
    }

    static ColumnMeta columnMeta(MdmColumn c, Chain chain, String matchedSystem, String systemPhysName) {
        EffectiveDomainView v = chain == null ? null : chain.view();
        return new ColumnMeta(
                c.getPhysName().toUpperCase(Locale.ROOT),
                c.getColumnName(),
                c.getLabelLong(),
                c.getLabelMid(),
                c.getLabelShort(),
                c.getDescription(),
                c.getUsageNote(),
                v == null ? null : v.dataType(),
                v == null ? null : v.length(),
                v == null ? null : v.scale(),
                c.isRequired(),
                c.getDefaultValue(),
                c.getRefKind(),
                c.getRefTarget(),
                c.getRefCateId(),
                chain == null ? null : new DomainRef(String.valueOf(chain.self().domainId()), chain.self().domainName(), v.domainKind()),
                v == null || v.chainStdExpr() == null ? null : new Expr(v.chainStdExpr(), chain.chainStdAst()),
                v == null || v.bizExpr() == null ? null : new BizExpr(v.bizExpr()),
                v == null || v.bizRequiredVars() == null ? List.of() : v.bizRequiredVars(),
                v == null || v.codeRef() == null ? null : new CodeRefMeta(v.codeRef().maruCodeId(), v.codeRef().cateId()),
                matchedSystem,
                systemPhysName);
    }

    static DomainMeta domainMeta(Chain chain) {
        EffectiveDomainView v = chain.view();
        DomainNode self = chain.self();
        return new DomainMeta(
                String.valueOf(self.domainId()),
                self.domainName(),
                self.stdName(),
                v.domainKind(),
                v.dataType(),
                v.length(),
                v.scale(),
                v.unitCode(),
                self.description(),
                v.chainStdExpr() == null ? null : new Expr(v.chainStdExpr(), chain.chainStdAst()),
                v.bizExpr() != null,
                v.codeRef() == null ? null : new CodeRefMeta(v.codeRef().maruCodeId(), v.codeRef().cateId()));
    }

    private static Long parseId(String key) {
        try {
            return key == null ? null : Long.valueOf(key.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
