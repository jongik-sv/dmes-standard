package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.springframework.stereotype.Component;

/**
 * 저장된 세트의 겉모양·부르는 쪽 읽기(하위 세트 spec §2·§5·§6·§8, srv:6 조정 ①). 모든 질의는 기준 시각 {@code at} 을 받는다 — 화면 조회·DRAFT 저장
 * 경고·폐기·되살리기는 지금, 확정 검사는 확정하려는 apply_from(Ruling 24). 시계는 갖지 않는다.
 *
 * <ul>
 *   <li>겉모양({@link #read}) — 그 세트의 {@code at} 에 적용 중인 RELEASED 버전({@link RuleVersions#currentReleased})의 흐름(FLOW_JSON, 없으면 RULE_IDS
 *       한 줄)·룰 입출력({@link RuleIoReader#readAt} — 같은 시각)·손주 세트(재귀)로 {@link RuleSetInterface} 를 부른다. 그 버전이 없으면(DRAFT 만 있음
 *       포함) 없는 세트다. 상태는 {@link RuleVersions#effectiveStatus}. 한 번의 read 안에서 세트마다 한 번만 계산한다. 순환·깊이 초과로 더 내려갈 수
 *       없는 세트는 없는 세트로 본다(호출 그래프 검사가 먼저 막는다). FLOW_JSON 이 깨진 세트는 입출력이 빈 겉모양이다.</li>
 *   <li>부르는 쪽({@link #callers}·{@link #edges}) — 폐기하지 않은 부모의 {@code at} 이후에도 유효한 RELEASED 행
 *       ({@link RuleVersions#releasedValidFrom})의 CALL_SET_IDS 만 센다(Ruling 25). DRAFT 행은 세지 않는다.</li>
 * </ul>
 * 원장 읽기는 {@link Snapshot} 하나가 세트 전부·세트 버전 전부를 두 문장으로 읽어 두고 그 안에서 고른다. 빈 입력의 {@link #read} 는 원장을 읽지 않는다.
 */
@Component
public class SetCallIoReader {

    /** 부르는 쪽 행 하나 — 부모 세트와 그 세트의 (기준 시각 이후 유효한 RELEASED) 버전 행. */
    public record Caller(MdmRuleSet parent, MdmRuleSetVer ver) {

        public String setId() {
            return parent.getMaruRuleSetId();
        }
    }

    private final RuleQueries queries;
    private final RuleSetVersionQueries setVersions;
    private final RuleIoReader ioReader;

    public SetCallIoReader(RuleQueries queries, RuleSetVersionQueries setVersions, RuleIoReader ioReader) {
        this.queries = queries;
        this.setVersions = setVersions;
        this.ioReader = ioReader;
    }

    /** 한 요청 안에서 여러 질의를 같은 원장 읽기로 할 때(연쇄 재검사·확정 검사). 원장을 고치기 전 읽기 경로에서만 쓴다. */
    public Snapshot snapshot() {
        return new Snapshot();
    }

    /** 세트 ID 들의 at 기준 겉모양(입력 순서, 중복·빈 ID 제외). 없는 세트는 {@link SetCallIo#missing}. 빈 입력이면 원장을 읽지 않는다. */
    public Map<String, SetCallIo> read(Collection<String> setIds, LocalDateTime at) {
        if (setIds.stream().noneMatch(SetCallIoReader::notBlank)) {
            return new LinkedHashMap<>();
        }
        return snapshot().read(setIds, at);
    }

    /** 흐름의 SET 노드가 부르는 세트의 at 기준 겉모양(깊이 우선 순서). SET 노드가 없으면 원장을 읽지 않는다. */
    public Map<String, SetCallIo> callsOf(FlowDefinition flow, LocalDateTime at) {
        return read(RuleSetFlowJson.setIds(flow), at);
    }

    /** 저장하려는(또는 확정하려는) 흐름의 겉모양 — 룰은 rules, 하위 세트는 at 기준 저장된 것. exists=true 로 계산한다. */
    public SetCallIo of(String setId, String setName, String status, FlowDefinition flow, Map<String, RuleIo> rules, LocalDateTime at) {
        return RuleSetInterface.of(setId, setName, true, status, flow, rules, callsOf(flow, at));
    }

    /** setId 를 부르는 쪽 행(Ruling 25) — 세트 ID 순, 같은 세트 안에서는 VER 오름차순. */
    public List<Caller> callers(String setId, LocalDateTime at) {
        return snapshot().callers(setId, at);
    }

    /** 호출 그래프 입력(Ruling 25) — 폐기 안 한 세트마다 at 이후 유효한 RELEASED 행들의 CALL_SET_IDS 합집합(처음 나온 순서). 부르는 것이 없는 세트는 뺀다. */
    public Map<String, List<String>> edges(LocalDateTime at) {
        return snapshot().edges(at);
    }

    /** 버전 행의 CALL_SET_IDS(저장 순서). 비었거나 null 이면 빈 목록. */
    public static List<String> callIds(MdmRuleSetVer v) {
        String json = v.getCallSetIds();
        if (json == null || json.isBlank()) {
            return List.of();
        }
        return DomainJson.readList(json).stream().map(String::valueOf).toList();
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    /** 원장 읽기 한 벌 — 세트 전부·버전 전부를 처음 쓸 때 한 번 읽고, 룰 타입 해석 범위 하나를 같이 쓴다. */
    public final class Snapshot {

        private Map<String, MdmRuleSet> sets;
        private Map<String, List<MdmRuleSetVer>> versions;
        private RuleVarTypeResolver.Scope scope;

        private Snapshot() {
        }

        /** 이 읽기의 룰 타입 해석 범위(연쇄 재검사가 부모 룰을 같은 범위로 읽는다). */
        public RuleVarTypeResolver.Scope scope() {
            if (scope == null) {
                scope = ioReader.scope();
            }
            return scope;
        }

        private void load() {
            if (sets != null) {
                return;
            }
            sets = new LinkedHashMap<>();
            queries.allSets().forEach(s -> sets.put(s.getMaruRuleSetId(), s));
            versions = sets.isEmpty() ? Map.of() : setVersions.versionsOf(sets.keySet());
        }

        /** {@link SetCallIoReader#read} 와 같다. */
        public Map<String, SetCallIo> read(Collection<String> setIds, LocalDateTime at) {
            Map<String, SetCallIo> out = new LinkedHashMap<>();
            Map<String, SetCallIo> memo = new HashMap<>();
            for (String id : setIds) {
                if (notBlank(id) && !out.containsKey(id)) {
                    load();
                    out.put(id, compute(id, at, memo, List.of()));
                }
            }
            return out;
        }

        /** {@link SetCallIoReader#callsOf} 와 같다. */
        public Map<String, SetCallIo> callsOf(FlowDefinition flow, LocalDateTime at) {
            return read(RuleSetFlowJson.setIds(flow), at);
        }

        /** {@link SetCallIoReader#callers} 와 같다. */
        public List<Caller> callers(String setId, LocalDateTime at) {
            load();
            List<Caller> out = new ArrayList<>();
            for (MdmRuleSet s : sets.values()) {
                if ("DEPRECATED".equals(s.getStatus())) {
                    continue;
                }
                for (MdmRuleSetVer v : RuleVersions.releasedValidFrom(versions.getOrDefault(s.getMaruRuleSetId(), List.of()), at)) {
                    if (callIds(v).contains(setId)) {
                        out.add(new Caller(s, v));
                    }
                }
            }
            return out;
        }

        /** {@link SetCallIoReader#edges} 와 같다. */
        public Map<String, List<String>> edges(LocalDateTime at) {
            load();
            Map<String, List<String>> out = new LinkedHashMap<>();
            for (MdmRuleSet s : sets.values()) {
                if ("DEPRECATED".equals(s.getStatus())) {
                    continue;
                }
                Set<String> calls = new LinkedHashSet<>();
                for (MdmRuleSetVer v : RuleVersions.releasedValidFrom(versions.getOrDefault(s.getMaruRuleSetId(), List.of()), at)) {
                    calls.addAll(callIds(v));
                }
                if (!calls.isEmpty()) {
                    out.put(s.getMaruRuleSetId(), List.copyOf(calls));
                }
            }
            return out;
        }

        /** 세트 하나의 겉모양. stack 은 이 read 안에서 지금 계산 중인 위쪽 세트들(순환·깊이 방어). 방어로 돌려준 없는 세트는 memo 에 넣지 않는다. */
        private SetCallIo compute(String setId, LocalDateTime at, Map<String, SetCallIo> memo, List<String> stack) {
            SetCallIo done = memo.get(setId);
            if (done != null) {
                return done;
            }
            if (stack.contains(setId) || stack.size() > RuleSetCallGraph.MAX_DEPTH) {
                return SetCallIo.missing(setId);
            }
            MdmRuleSet s = sets.get(setId);
            List<MdmRuleSetVer> vers = versions.getOrDefault(setId, List.of());
            Optional<MdmRuleSetVer> cur = s == null ? Optional.empty() : RuleVersions.currentReleased(vers, at);
            SetCallIo io;
            if (cur.isEmpty()) {
                io = SetCallIo.missing(setId);
            } else {
                String status = RuleVersions.effectiveStatus(s.getStatus(), vers, at);
                FlowDefinition flow;
                try {
                    flow = RuleSetVersionQueries.flow(cur.get());
                } catch (IllegalArgumentException e) {
                    flow = null;
                }
                if (flow == null) {
                    io = new SetCallIo(setId, s.getMaruRuleSetName(), true, status, List.of(), List.of(), false);
                } else {
                    List<String> next = new ArrayList<>(stack);
                    next.add(setId);
                    Map<String, SetCallIo> calls = new LinkedHashMap<>();
                    for (String c : RuleSetFlowJson.setIds(flow)) {
                        calls.put(c, compute(c, at, memo, List.copyOf(next)));
                    }
                    Map<String, RuleIo> rules = ioReader.readAt(RuleSetFlowJson.ruleIds(flow), at, scope());
                    io = RuleSetInterface.of(setId, s.getMaruRuleSetName(), true, status, flow, rules, calls);
                }
            }
            memo.put(setId, io);
            return io;
        }
    }
}
