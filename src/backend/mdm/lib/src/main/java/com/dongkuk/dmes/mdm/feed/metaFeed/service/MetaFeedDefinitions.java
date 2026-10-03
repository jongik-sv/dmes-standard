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
import kr.dongkuk.maru.mdm.engine.code.CodeRowsProjection;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import org.springframework.stereotype.Component;

/**
 * 룰·룰세트·마스터코드·전문 정의 묶음(spec 2026-10-02-mdm-meta-cache-design §3.4). 넷 다 RELEASED 기준이다(마스터코드는 D-152).
 * {@link StoredDefinitionLookup}·{@link MdmCodeLookup} 은
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

    /** 코드 원장 질의 — {@link MetaFeedVersioned} 가 코드 목차·본문을 만들 때 쓴다. */
    MasterCodeLedgerQueries ledger() {
        return ledger;
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
                for (MdmRuleVer v : releasedRuleVersions(id)) {
                    released.add(assembleRule(id, rule.get(), v, scope));
                }
                found.put(id, MetaFeedJson.plain(released));
            } catch (BusinessException | IllegalArgumentException | IllegalStateException e) {
                failed.put(id, e.getMessage());
            }
        }
        return new MetaFeedResult(found, failed);
    }

    /** RELEASED 룰 버전 하나의 정의(D-154 — 피드 전 이력·목차 current·본문이 같은 조립을 쓴다). 저장값이 깨지면 IllegalStateException. */
    RuleDefinition assembleRule(String id, MdmRule rule, MdmRuleVer v, RuleVarTypeResolver.Scope scope) {
        StoredRuleDefinitions.Stored s = stored.read(id, v, scope);
        RuleDefinitionAssembler.Assembled a = stored.assemble(id, rule.getRuleKind(), s, scope);
        if (!a.failures().isEmpty() || !a.skippedRows().isEmpty()) {
            throw new IllegalStateException("룰 " + id + " 버전 " + v.getVer() + " 의 저장된 행을 조립할 수 없습니다");
        }
        return a.definition();
    }

    /** RELEASED·적용 시작 있는 룰 버전, ver 오름차순. */
    List<MdmRuleVer> releasedRuleVersions(String id) {
        return ruleQueries.versions(id).stream()
                .filter(v -> RELEASED.equals(v.getStatus()) && v.getApplyFrom() != null)
                .sorted(Comparator.comparing(MdmRuleVer::getVer))
                .toList();
    }

    RuleVarTypeResolver.Scope ruleScope() {
        return stored.scope();
    }

    Optional<MdmRule> rule(String id) {
        return rules.findById(id);
    }

    public MetaFeedResult ruleSets(Collection<String> setIds) {
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (String id : setIds) {
            try {
                releasedSets(id).ifPresent(released -> found.put(id, MetaFeedJson.plain(released)));
            } catch (StoredDefinitionException e) {
                failed.put(id, e.getMessage());
            }
        }
        return new MetaFeedResult(found, failed);
    }

    /** 세트의 RELEASED 버전 정의(ver 오름차순). 세트가 없으면 빈 값. 저장값이 깨지면 StoredDefinitionException. */
    Optional<List<RuleSetDefinition>> releasedSets(String id) {
        return new StoredDefinitionLookup(ruleQueries, stored, rules, setVersions, sets).releasedSets(id);
    }

    /**
     * 마루 코드 원본(다섯 표)의 RELEASED 투영(D-152, {@link CodeRowsProjection#releasedOnly}) — 룰·룰 세트·전문처럼 업무 모듈 캐시에는
     * RELEASED 기준 행만 싣는다. RELEASED 가 아닌 버전(DRAFT·REQUESTED·APPROVED·CANCELLED)과 그 버전에서만 유효한 행(초안 사본)은 빠지고, 초안 전용 카테고리 정의가 RELEASED
     * 판정에 소급되지도 않는다. {@link MdmCodeLookup} 자체는 원장 그대로 둔다 — 룰 저장 검사({@code CodeReferenceCheck})처럼 초안을 포함한
     * 원장 기준 검사가 같은 조회를 쓰기 때문이다.
     */
    public MetaFeedResult codes(Collection<String> maruCodeIds) {
        MdmCodeLookup lookup = new MdmCodeLookup(ledger);
        Map<String, Object> found = new LinkedHashMap<>();
        for (String id : maruCodeIds) {
            lookup.code(id).ifPresent(rows -> found.put(id, MetaFeedJson.plain(CodeRowsProjection.releasedOnly(rows))));
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
            Optional<Long> id = messageLayoutId(key);
            if (id.isEmpty()) {
                continue;
            }
            try {
                found.put(key, layoutVersions(releasedLayouts(id.get())));
            } catch (BusinessException | IllegalArgumentException | IllegalStateException e) {
                failed.put(key, e.getMessage());
            }
        }
        return new MetaFeedResult(found, failed);
    }

    /** MESSAGE 전문 키 → ID. 숫자가 아니거나 없는 ID·헤더면 빈 값(Ruling R9). */
    Optional<Long> messageLayoutId(String key) {
        Long id;
        try {
            id = Long.valueOf(key.trim());
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
        boolean message = layouts.findById(id).map(l -> MESSAGE.equals(l.getLayoutKind())).orElse(false);
        return message ? Optional.of(id) : Optional.empty();
    }

    List<LayoutReleaseTimeline.ReleasedVersion> releasedLayouts(long id) {
        return timeline.released(id);
    }

    private static List<Object> layoutVersions(List<LayoutReleaseTimeline.ReleasedVersion> released) {
        List<Object> out = new ArrayList<>();
        for (LayoutReleaseTimeline.ReleasedVersion v : released) {
            out.add(layoutVersion(v));
        }
        return out;
    }

    /** 전문 RELEASED 버전 하나의 피드 값 — {@code {ver:"1.000", applyFrom, applyTo, segments[{applyFrom, applyTo, snapshot}]}}. */
    static Map<String, Object> layoutVersion(LayoutReleaseTimeline.ReleasedVersion v) {
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
        return row;
    }
}
