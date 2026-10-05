package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer.SetIo;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.Guarded;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.flow.Step;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 세트의 겉모양 계산(하위 세트 spec §2) — 스프링·DB 없는 순수 함수. 입력·최종 결과는 {@link RuleSetAnalyzer#io} 의 것이고(입력에서 예약 이름
 * {@code CATCH_*} 는 뺀다 — 편차 11), always 는 END 에 닿는 모든 경로의 END 직전 상태로 정한다(Ruling 16): 루트 순차 끝 상태와 모든 끝냄 지점
 * (끝내는 처리 갈래 끝·끝내는 IF 갈래 끝, 처리 갈래 안이든 밖이든)의 상태를 교집합한다. 엔진 {@code SetShape} 가 같은 알고리즘을 실행용으로 갖는다
 * — 바꾸면 함께 바꾸고 {@code SetCallIoEngineAgreementTest} 로 확인한다.
 */
public final class RuleSetInterface {

    private RuleSetInterface() {
    }

    /**
     * @param exists 기준 시각에 그 세트의 RELEASED 버전이 있는가(Ruling 24) — 호출자가 기준 시각의 RELEASED 유무로 정한다. DRAFT 만 있으면 false 이고
     *               {@link SetCallIo#missing} 을 돌려준다
     * @param flow   세트 흐름(FLOW_JSON 이 없는 세트는 {@code FlowParser.linear(ruleIds)})
     * @param rules  흐름의 룰 입출력(RuleIoReader 결과, 룰 저장 검사는 저장하려는 정의로 한 항목을 바꾼 맵)
     * @param calls  흐름의 SET 노드가 부르는 세트의 겉모양(세트 ID →, 손주는 호출자가 먼저 계산한다)
     */
    public static SetCallIo of(String setId, String setName, boolean exists, String status, FlowDefinition flow, Map<String, RuleIo> rules,
            Map<String, SetCallIo> calls) {
        if (!exists) {
            return SetCallIo.missing(setId);
        }
        FlowParse p = FlowParser.parse(flow);
        Map<String, RuleIo> all = RuleSetAnalyzer.withCalls(rules, calls);
        SetIo io = RuleSetAnalyzer.io(RuleSetAnalyzer.callKeys(flow, p), all);
        Set<String> end = p.tree() == null ? Set.of() : endSure(p.tree().root(), c -> sure(c, all, calls));
        List<IoName> inputs = io.inputs().stream()
                .filter(i -> !ReservedNames.CATCH_NAMES.contains(i.name().toUpperCase(Locale.ROOT)))
                .map(i -> new IoName(i.name(), i.source(), i.label(), i.dataType(), i.scale(), i.dateString(), i.maruCodeId()))
                .toList();
        List<SetCallIo.OutputName> outputs = io.results().stream().filter(RuleSetAnalyzer.ResultRow::finalResult)
                .map(r -> new SetCallIo.OutputName(r.name(), r.dataType(), r.scale(), r.dateString(), r.maruCodeId(), end.contains(r.name())))
                .toList();
        return new SetCallIo(setId, setName, true, status, inputs, outputs, p.tree() != null && endsEarly(p.tree().root(), false));
    }

    /** 단계 하나가 반드시 만드는 이름 — RULE 은 결과 전부, SET 은 always 출력, TASK 는 없음. */
    private static Set<String> sure(Step c, Map<String, RuleIo> all, Map<String, SetCallIo> calls) {
        Set<String> out = new HashSet<>();
        if (c instanceof RuleStep r) {
            RuleIo io = all.get(r.ruleId());
            if (io != null && io.exists() && io.results() != null) {
                io.results().forEach(x -> out.add(x.name()));
            }
        } else if (c instanceof SetStep s && s.setId() != null && !s.setId().isBlank()) {
            SetCallIo call = calls.get(s.setId());
            if (call != null && call.exists()) {
                call.outputs().stream().filter(SetCallIo.OutputName::always).forEach(o -> out.add(o.name()));
            }
        }
        return out;
    }

    /** END 직전에 반드시 정의된 이름 — 루트 끝 상태와 모든 끝냄 지점 상태의 교집합(Ruling 16, 엔진 SetShape 와 같은 걷기). */
    static Set<String> endSure(Seq root, Function<Step, Set<String>> sure) {
        List<Set<String>> ends = new ArrayList<>();
        Set<String> st = new HashSet<>();
        walk(root, st, sure, ends);
        ends.add(st);
        Set<String> out = new HashSet<>(ends.get(0));
        ends.forEach(out::retainAll);
        return out;
    }

    private static void walk(Seq seq, Set<String> st, Function<Step, Set<String>> sure, List<Set<String>> ends) {
        for (Block b : seq.items()) {
            if (b instanceof Step s) {
                st.addAll(sure.apply(s));
            } else if (b instanceof Seq q) {
                walk(q, st, sure, ends);
            } else if (b instanceof Split sp) {
                List<Set<String>> outs = new ArrayList<>();
                for (Branch br : sp.branches()) {
                    Set<String> b2 = new HashSet<>(st);
                    walk(br.body(), b2, sure, ends);
                    if (br.ends()) {
                        ends.add(b2); // 끝내는 IF 갈래 — 블록 뒤로 이어지지 않고 END 지점이다(편차 8, D-136 §13)
                    } else {
                        outs.add(b2);
                    }
                }
                if (outs.isEmpty()) {
                    continue; // 이어지는 갈래가 없으면 블록 뒤 상태는 그대로 둔다(구조 검사가 막는 모양)
                }
                if (sp.kind() == NodeKind.IF) {
                    Set<String> inter = new HashSet<>(outs.get(0));
                    outs.forEach(inter::retainAll);
                    st.addAll(inter);
                } else {
                    outs.forEach(st::addAll);
                }
            } else if (b instanceof Guarded g) {
                Set<String> base = new HashSet<>(st);
                Set<String> normal = new HashSet<>(base);
                normal.addAll(sure.apply(g.step()));
                walk(g.normal(), normal, sure, ends);
                List<Set<String>> back = new ArrayList<>(List.of(normal));
                for (Guarded.Handler h : g.handlers()) {
                    Set<String> hs = new HashSet<>(base);
                    walk(h.body(), hs, sure, ends);
                    if (h.ends()) {
                        ends.add(hs);
                    } else {
                        back.add(hs);
                    }
                }
                Set<String> inter = new HashSet<>(back.get(0));
                back.forEach(inter::retainAll);
                st.clear();
                st.addAll(inter);
            }
        }
    }

    /**
     * {@code endedBy} 를 남기는 끝냄이 있는가(편차 10, spec §4.2) — 처리 갈래가 END 로 가거나, 처리 갈래 안(중첩 포함) IF 갈래가 END 로 간다.
     * 처리 갈래 밖의 끝내는 IF 갈래는 세지 않는다(부모에게는 정상 완료다).
     */
    static boolean endsEarly(Seq seq, boolean inHandler) {
        for (Block b : seq.items()) {
            if (b instanceof Seq q && endsEarly(q, inHandler)) {
                return true;
            }
            if (b instanceof Split sp) {
                for (Branch br : sp.branches()) {
                    if ((inHandler && br.ends()) || endsEarly(br.body(), inHandler)) {
                        return true;
                    }
                }
            }
            if (b instanceof Guarded g) {
                if (endsEarly(g.normal(), inHandler)) {
                    return true;
                }
                for (Guarded.Handler h : g.handlers()) {
                    if (h.ends() || endsEarly(h.body(), true)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
