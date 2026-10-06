package com.dongkuk.dmes.mdm.dme.ruleSetEdit.service;

import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIoReader;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import org.springframework.stereotype.Component;

/**
 * 디버거 기록 실행({@code ruleSetEdit} action {@code execute}) 응답의 {@code calledFlows}(하위 세트 spec §8, 계획 편차 2) — 실행 중 부른 세트마다
 * 판정 시각에 적용된 RELEASED 버전의 흐름(MY_DRAFT 면 조회기가 DRAFT 로 고른 세트는 그 행). 디버거가 SET 노드로 들어가 하위 흐름을 그릴 때 쓴다.
 *
 * <p>모양: 세트 ID → {@code {setId, setName, flow, ruleIds, rules}}. {@code flow} 는 저장된 FLOW_JSON 맵(화면 {@code view} 포함, 없으면 null =
 * 한 줄 세트 — 화면이 {@code ruleIds} 로 그린다), {@code ruleIds} 는 그 버전의 룰(흐름 깊이 우선 또는 RULE_IDS 순서), {@code rules} 는 그 룰들의
 * 입출력({@link RuleIo}, 판정 시각에 적용된 RELEASED 로 계산 — 룰 노드 제목용). 엔진 정의({@code RuleSetDefinition.flow})는 {@code view} 를
 * 버리므로 버전 행을 직접 읽는다.
 *
 * <p>읽는 순서: 기록의 SET 노드 {@code sub} 를 깊이 우선으로 따라가 처음 나온 순서, 같은 세트는 한 번. 부른 세트가 없으면 원장을 읽지 않는다
 * ({@code RuleSetEditQueryCountTest}). 있으면 부모 행·버전 행을 한 번에 읽고, 룰 입출력도 모든 세트의 룰을 한 번에 읽는다. 판정 시각에 적용된
 * RELEASED 가 없는 세트(기록 뒤 바뀐 경우)는 뺀다(DRAFT 로 고른 세트는 빼지 않는다). 저장값을 읽지 못한 버전은 {@code flow=null}·읽을 수 있는 만큼의 {@code ruleIds} 로 싣는다.
 */
@Component
public class RuleSetCalledFlows {

    private final MdmRuleSetRepository sets;
    private final RuleSetVersionQueries setVersions;
    private final RuleIoReader ioReader;

    public RuleSetCalledFlows(MdmRuleSetRepository sets, RuleSetVersionQueries setVersions, RuleIoReader ioReader) {
        this.sets = sets;
        this.setVersions = setVersions;
        this.ioReader = ioReader;
    }

    /** 기록에서 부른 세트 → 그 세트의 흐름 요약. 없으면 빈 맵. */
    public Map<String, Object> of(RunTrace trace) {
        return of(trace, Map.of());
    }

    /**
     * {@code drafts}(조회기가 DRAFT 로 실행한 세트 → 버전 행, spec 2026-10-06 §4.7)에 있는 세트는 그 행을, 나머지는 판정 시각 RELEASED 를 쓴다.
     * 노드 제목용 {@code rules} 는 RELEASED 기준({@link RuleIoReader#readAt}) 그대로다(후속 F1).
     */
    public Map<String, Object> of(RunTrace trace, Map<String, MdmRuleSetVer> drafts) {
        Set<String> ids = new LinkedHashSet<>();
        collect(trace, ids);
        if (ids.isEmpty()) {
            return Map.of();
        }
        LocalDateTime at = LocalDateTime.ofInstant(trace.evalTs(), MdmClockConfig.KST);
        Map<String, MdmRuleSet> parents = new HashMap<>();
        sets.findAllById(ids).forEach(s -> parents.put(s.getMaruRuleSetId(), s));
        Map<String, List<MdmRuleSetVer>> versions = setVersions.versionsOf(ids);

        List<Picked> picked = new ArrayList<>();
        Set<String> allRules = new LinkedHashSet<>();
        for (String id : ids) {
            MdmRuleSet parent = parents.get(id);
            Optional<MdmRuleSetVer> v = drafts.containsKey(id) ? Optional.of(drafts.get(id))
                    : RuleVersions.currentReleased(versions.getOrDefault(id, List.of()), at);
            if (parent == null || v.isEmpty()) {
                continue;
            }
            Picked p = pick(parent, v.get());
            picked.add(p);
            allRules.addAll(p.ruleIds());
        }
        Map<String, RuleIo> io = allRules.isEmpty() ? Map.of() : ioReader.readAt(allRules, at, ioReader.scope());

        Map<String, Object> out = new LinkedHashMap<>();
        for (Picked p : picked) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("setId", p.setId());
            m.put("setName", p.setName());
            m.put("flow", p.flow());
            m.put("ruleIds", p.ruleIds());
            m.put("rules", p.ruleIds().stream().map(io::get).filter(r -> r != null).toList());
            out.put(p.setId(), m);
        }
        return out;
    }

    /** 부른 세트 ID — SET 노드의 {@code sub} 를 깊이 우선으로, 처음 나온 순서. */
    static void collect(RunTrace trace, Set<String> ids) {
        for (RunTrace.NodeTrace n : trace.nodes()) {
            if (n.sub() != null) {
                ids.add(n.sub().setId());
                collect(n.sub(), ids);
            }
        }
    }

    private record Picked(String setId, String setName, Map<String, Object> flow, List<String> ruleIds) {
    }

    private static Picked pick(MdmRuleSet parent, MdmRuleSetVer v) {
        String id = parent.getMaruRuleSetId();
        Map<String, Object> flow = null;
        List<String> ruleIds;
        try {
            if (v.getFlowJson() != null) {
                flow = RuleSetFlowJson.toMap(v.getFlowJson());
                ruleIds = RuleSetFlowJson.ruleIds(RuleSetFlowJson.parse(v.getFlowJson()));
            } else {
                ruleIds = RuleSetVersionQueries.members(v);
            }
        } catch (IllegalArgumentException e) {
            flow = null;
            ruleIds = membersOrEmpty(v);
        }
        return new Picked(id, parent.getMaruRuleSetName(), flow, ruleIds);
    }

    private static List<String> membersOrEmpty(MdmRuleSetVer v) {
        try {
            return RuleSetVersionQueries.members(v);
        } catch (IllegalArgumentException e) {
            return List.of();
        }
    }
}
