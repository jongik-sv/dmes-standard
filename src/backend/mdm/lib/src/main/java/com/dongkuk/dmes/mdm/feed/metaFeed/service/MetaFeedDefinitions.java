package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MdmCodeLookup;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.definition.RuleDefinitionAssembler;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionException;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotJson;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.springframework.stereotype.Component;

/**
 * 룰·룰세트·마스터코드·전문 정의 묶음(spec 2026-10-02-mdm-meta-cache-design §3.4). {@link StoredDefinitionLookup}·{@link MdmCodeLookup} 은
 * 빈이 아니다(D-077, ADR-0005 — {@code DefinitionLookup} 빈 0개 가드) — 호출마다 {@code new} 로 만든다.
 *
 * <p>룰과 룰 세트는 RELEASED 버전 <b>전체</b>를 준다 — 적용 시작일 도래는 쓰기가 없어 기록이 남지 않으므로 업무 모듈이 판정 시각으로 그때그때
 * 고른다(§4.1). 룰 세트도 D-144 2단계부터 버전이 있다({@link StoredDefinitionLookup#releasedSets}, 엔진 {@code RuleSetDefinition} 의
 * ver·applyFrom·applyTo). 목록은 {@code ver}(소수 scale 3, D-144) 오름차순 — {@code BigDecimal.compareTo} 수 비교다. JSON 은 number 로
 * 자리수를 지킨다({@code 1.000}). 세트가 있는데 RELEASED 가 없으면 빈 목록이다(룰과 같다).
 * 저장값이 깨져 정의를 만들 수 없는 키는 그 키만 failed 로 준다(Ruling R4).
 */
@Component
public class MetaFeedDefinitions {

    private static final String RELEASED = "RELEASED";

    private final RuleQueries ruleQueries;
    private final StoredRuleDefinitions stored;
    private final MdmRuleRepository rules;
    private final MdmRuleSetRepository sets;
    private final RuleSetVersionQueries setVersions;
    private final MasterCodeLedgerQueries ledger;
    private final LayoutVersionStore layoutVersions;

    public MetaFeedDefinitions(RuleQueries ruleQueries, StoredRuleDefinitions stored, MdmRuleRepository rules, MdmRuleSetRepository sets,
                               RuleSetVersionQueries setVersions, MasterCodeLedgerQueries ledger, LayoutVersionStore layoutVersions) {
        this.ruleQueries = ruleQueries;
        this.stored = stored;
        this.rules = rules;
        this.sets = sets;
        this.setVersions = setVersions;
        this.ledger = ledger;
        this.layoutVersions = layoutVersions;
    }

    public MetaFeedResult rules(Collection<String> ruleIds) {
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        RuleVarTypeResolver.Scope scope = stored.scope();
        for (String id : ruleIds) {
            Optional<MdmRule> rule = rules.findById(id);
            if (rule.isEmpty()) {
                continue;
            }
            try {
                List<RuleDefinition> released = new ArrayList<>();
                for (MdmRuleVer v : ruleQueries.versions(id)) {
                    if (!RELEASED.equals(v.getStatus()) || v.getApplyFrom() == null) {
                        continue;
                    }
                    StoredRuleDefinitions.Stored s = stored.read(id, v, scope);
                    RuleDefinitionAssembler.Assembled a = stored.assemble(id, rule.get().getRuleKind(), s, scope);
                    if (!a.failures().isEmpty() || !a.skippedRows().isEmpty()) {
                        throw new IllegalStateException("룰 " + id + " 버전 " + v.getVer() + " 의 저장된 행을 조립할 수 없습니다");
                    }
                    released.add(a.definition());
                }
                released.sort(Comparator.comparing(RuleDefinition::ver)); // ver 는 BigDecimal(D-144) — compareTo 수 비교, 문자열 정렬 아님
                found.put(id, MetaFeedJson.plain(released));
            } catch (BusinessException | IllegalArgumentException | IllegalStateException e) {
                failed.put(id, e.getMessage());
            }
        }
        return new MetaFeedResult(found, failed);
    }

    public MetaFeedResult ruleSets(Collection<String> setIds) {
        StoredDefinitionLookup lookup = new StoredDefinitionLookup(ruleQueries, stored, rules, setVersions, sets);
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (String id : setIds) {
            try {
                lookup.releasedSets(id).ifPresent(released -> found.put(id, MetaFeedJson.plain(released)));
            } catch (StoredDefinitionException e) {
                failed.put(id, e.getMessage());
            }
        }
        return new MetaFeedResult(found, failed);
    }

    public MetaFeedResult codes(Collection<String> maruCodeIds) {
        MdmCodeLookup lookup = new MdmCodeLookup(ledger);
        Map<String, Object> found = new LinkedHashMap<>();
        for (String id : maruCodeIds) {
            lookup.code(id).ifPresent(rows -> found.put(id, MetaFeedJson.plain(rows)));
        }
        return new MetaFeedResult(found, Map.of());
    }

    /** 최신 TB_MDM_LAYOUT_VER 스냅샷. 버전이 없는 ID(헤더 레이아웃·숫자가 아닌 키)는 빠진다(Ruling R9). */
    public MetaFeedResult layouts(Collection<String> layoutIds) {
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (String key : layoutIds) {
            Long id;
            try {
                id = Long.valueOf(key.trim());
            } catch (NumberFormatException e) {
                continue;
            }
            try {
                layoutVersions.latest(id).ifPresent(v ->
                        found.put(key, MetaFeedJson.plain(LayoutSnapshotJson.toMap(LayoutSnapshotJson.read(v.getSnapshotJson())))));
            } catch (IllegalArgumentException | IllegalStateException e) {
                failed.put(key, e.getMessage());
            }
        }
        return new MetaFeedResult(found, failed);
    }
}
