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
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutReleaseTimeline;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
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
    private static final String MESSAGE = "MESSAGE";

    private final RuleQueries ruleQueries;
    private final StoredRuleDefinitions stored;
    private final MdmRuleRepository rules;
    private final MdmRuleSetRepository sets;
    private final RuleSetVersionQueries setVersions;
    private final MasterCodeLedgerQueries ledger;
    private final MdmLayoutRepository layouts;
    private final LayoutReleaseTimeline timeline;

    public MetaFeedDefinitions(RuleQueries ruleQueries, StoredRuleDefinitions stored, MdmRuleRepository rules, MdmRuleSetRepository sets,
                               RuleSetVersionQueries setVersions, MasterCodeLedgerQueries ledger, MdmLayoutRepository layouts,
                               LayoutReleaseTimeline timeline) {
        this.ruleQueries = ruleQueries;
        this.stored = stored;
        this.rules = rules;
        this.sets = sets;
        this.setVersions = setVersions;
        this.ledger = ledger;
        this.layouts = layouts;
        this.timeline = timeline;
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

    /**
     * 전문별 RELEASED 버전 목록(D-144 3단계, ADR-0007 D6) — 룰·룰 세트처럼 업무 모듈이 판정 시각으로 고른다. 버전마다 {@code ver}(문자열
     * {@code "1.000"} — 자리수를 지킨다)·{@code applyFrom}·{@code applyTo} 와, 그 구간을 쌓은 헤더 버전 경계로 나눈 합성 구간
     * {@code segments[{applyFrom, applyTo, snapshot}]} 를 싣는다({@link LayoutReleaseTimeline}). 목록은 VER 수 비교 오름차순이다.
     * 헤더 레이아웃·없는 ID·숫자가 아닌 키는 빠지고(Ruling R9), RELEASED 가 없는 전문은 빈 목록이다(룰·룰 세트와 같다). 어느 구간이든
     * 합성이 깨진 전문(쌓은 헤더에 그 시각 RELEASED 가 없음 등)은 그 키만 failed 다(Ruling R4).
     */
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
            boolean message = layouts.findById(id).map(l -> MESSAGE.equals(l.getLayoutKind())).orElse(false);
            if (!message) {
                continue;
            }
            try {
                found.put(key, layoutVersions(timeline.released(id)));
            } catch (BusinessException | IllegalArgumentException | IllegalStateException e) {
                failed.put(key, e.getMessage());
            }
        }
        return new MetaFeedResult(found, failed);
    }

    private static List<Object> layoutVersions(List<LayoutReleaseTimeline.ReleasedVersion> released) {
        List<Object> out = new ArrayList<>();
        for (LayoutReleaseTimeline.ReleasedVersion v : released) {
            List<Object> segments = new ArrayList<>();
            for (LayoutReleaseTimeline.Segment s : v.segments()) {
                Map<String, Object> seg = new LinkedHashMap<>();
                seg.put("applyFrom", MetaFeedJson.plain(s.applyFrom()));
                seg.put("applyTo", MetaFeedJson.plain(s.applyTo()));
                seg.put("snapshot", MetaFeedJson.plain(s.snapshot()));
                segments.add(seg);
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("ver", VersionNumbers.plain(v.ver()));
            row.put("applyFrom", MetaFeedJson.plain(v.applyFrom()));
            row.put("applyTo", MetaFeedJson.plain(v.applyTo()));
            row.put("segments", segments);
            out.add(row);
        }
        return out;
    }
}
