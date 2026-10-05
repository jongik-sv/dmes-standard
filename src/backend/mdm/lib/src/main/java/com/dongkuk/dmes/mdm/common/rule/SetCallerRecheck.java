package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.SetCallIoReader.Caller;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.springframework.stereotype.Component;

/**
 * 연쇄 재검사(하위 세트 spec §6.1 3·4·§6.4, C-D11) — 겉모양이 바뀐 세트를 부르는 쪽 행({@link SetCallIoReader#callers}, Ruling 25)마다 그 버전의 흐름을
 * "바뀌기 전 겉모양"과 "바뀐 겉모양"으로 두 번 검사해({@link RuleSetAnalyzer#checks} 4인자), 뒤에만 있는 거부를 {@code CALLER_BROKEN}
 * ({@code "세트 P: …"}, Ruling 10)으로 모은다. 비교 키는 code·message·nodeId·edgeId. 뒤에만 있는 경고가 있으면 그 부모 ID 를 모은다. 부모의 겉모양도
 * 바뀌면({@link #shapeChanged} — 입출력 또는 endsEarly) 그 부모를 부르는 쪽으로 이어 가며 단계는 {@link RuleSetCallGraph#MAX_DEPTH} 까지다. 세트 확정 검사·DRAFT 저장 경고·룰 저장 검사가 같이 쓴다.
 *
 * <p>기준 시각 {@code at}(srv:6 조정 ①) — 부르는 쪽 행 고르기, 부모 흐름의 다른 룰 입출력({@link RuleIoReader#readAt}, spec §6.4 "다른 룰은 T 의
 * RELEASED"), 부모가 부르는 다른 세트의 겉모양이 모두 이 시각 기준이다.
 *
 * <p>정한 것(srv:6 A):
 * <ul>
 *   <li>문구 머리는 부모의 부르는 행이 하나면 {@code "세트 P: "}, 여럿(지금 RELEASED 와 미래 RELEASED)이면 {@code "세트 P v1.001: "} 이다. 같은 문구는
 *       한 번만 낸다.</li>
 *   <li>부모 흐름에 새로 생긴 네 코드({@link RuleSetCheck#CALL_CODES})는 수준이 WARN 이어도 거부로 센다 — 확정이 거부하는 코드다(조정 ②).</li>
 *   <li>위로 이어 갈 부모 겉모양은 {@code at} 에 적용 중인 행의 것이다(조부모가 {@code read(at)} 로 보는 것과 같다). 적용 중인 행이 없으면(미래 RELEASED
 *       만) 위로 잇지 않는다 — 조부모의 {@code read(at)} 에서 그 부모는 없는 세트라 겉모양이 바뀌지 않는다(srv:6 E2, A 의 "첫 행" 을 바꿈). 바뀐 세트
 *       자신이 자기를 부르는 행은 건너뛴다(순환은 호출 그래프 검사가 막는다).</li>
 *   <li>부모는 아래에서 바뀐 세트를 모두 반영한 뒤 한 번만 검사한다({@link #recheck(SetCallIoReader.Snapshot, String, SetCallIo, LocalDateTime)}).</li>
 *   <li>흐름을 읽지 못하는 부모 버전은 건너뛴다(그 세트의 저장 검사가 다룬다).</li>
 * </ul>
 */
@Component
public class SetCallerRecheck {

    /** 재검사 결과 — 새 거부(부르는 쪽 행마다 "세트 P: …", 처음 나온 순서)와 새 경고가 생긴 부모 ID(처음 나온 순서). */
    public record Outcome(List<RuleSetCheck> rejects, List<String> warnedCallers) {

        public boolean isEmpty() {
            return rejects.isEmpty() && warnedCallers.isEmpty();
        }
    }

    private final SetCallIoReader reader;
    private final RuleIoReader ioReader;

    public SetCallerRecheck(SetCallIoReader reader, RuleIoReader ioReader) {
        this.reader = reader;
        this.ioReader = ioReader;
    }

    /**
     * 부르는 쪽이 다시 검사해야 할 만큼 겉모양이 바뀌었는가 — 입출력({@link SetCallIo#sameShape})이 다르거나 endsEarly 가 다르다. endsEarly 는 부모 흐름의
     * SUBSET_ENDED 받는 노드 판정(CATCH_NEVER)을 바꾸므로 같이 본다({@code sameShape} 자체는 화면·다른 쓰임 때문에 그대로 둔다). 확정 검사·DRAFT 저장
     * 경고·룰 저장 검사의 진입 조건과 이 재검사의 위로 이어 가기가 같이 쓴다.
     */
    public static boolean shapeChanged(SetCallIo before, SetCallIo after) {
        return !before.sameShape(after) || before.endsEarly() != after.endsEarly();
    }

    /**
     * 자기 원장 읽기({@link SetCallIoReader#snapshot})로 재검사한다.
     *
     * @param setId 겉모양이 바뀐 세트
     * @param newIo 바뀐 겉모양(저장·확정하려는 정의로 계산한 것)
     * @param at    기준 시각(DRAFT 저장 = 지금, 확정 = apply_from)
     */
    public Outcome recheck(String setId, SetCallIo newIo, LocalDateTime at) {
        return recheck(reader.snapshot(), setId, newIo, at);
    }

    /**
     * 부르는 쪽이 이미 연 원장 읽기로 재검사한다(세트 확정 검사·DRAFT 저장·룰 저장 검사가 원장을 한 번만 읽게).
     *
     * <p>순서: 바뀐 세트에서 위로 {@link RuleSetCallGraph#MAX_DEPTH} 단계까지 부르는 세트를 먼저 모은 뒤, 아래 세트를 모두 끝낸 부모부터(같이 준비되면 찾은
     * 순서 — 단계, 그 안에서 세트 ID 순) 한 번씩 검사한다. 그래서 다이아몬드(P 가 S·Q 를 부르고 Q 도 S 를 부름)에서 P 는 S·Q 가 모두 바뀐 겉모양으로 한 번만
     * 검사되고, 중간 상태(S 만 바뀐 P)가 위로 가지 않는다. 부모의 행 가운데 바뀐 세트를 부르는 행만 검사하고, 그런 행이 없으면 건너뛴다. 저장된 순환으로 준비된
     * 부모가 없으면 찾은 순서의 첫 부모부터 검사한다(순환은 호출 그래프 검사가 막는다).
     */
    public Outcome recheck(SetCallIoReader.Snapshot snap, String setId, SetCallIo newIo, LocalDateTime at) {
        Map<String, Map<BigDecimal, Caller>> rowsOf = new LinkedHashMap<>();
        Map<String, Set<String>> below = new LinkedHashMap<>();
        List<String> pending = new ArrayList<>();
        Set<String> known = new HashSet<>(List.of(setId));
        List<String> level = List.of(setId);
        for (int depth = 0; depth < RuleSetCallGraph.MAX_DEPTH && !level.isEmpty(); depth++) {
            List<String> next = new ArrayList<>();
            for (String child : level) {
                for (Caller c : snap.callers(child, at)) {
                    String pid = c.setId();
                    if (pid.equals(setId)) {
                        continue;
                    }
                    rowsOf.computeIfAbsent(pid, k -> new TreeMap<>()).putIfAbsent(c.ver().getVer(), c);
                    below.computeIfAbsent(pid, k -> new LinkedHashSet<>()).add(child);
                    if (known.add(pid)) {
                        pending.add(pid);
                        next.add(pid);
                    }
                }
            }
            level = next;
        }
        Map<List<String>, RuleSetCheck> rejects = new LinkedHashMap<>();
        Set<String> warned = new LinkedHashSet<>();
        Map<String, SetCallIo> changed = new LinkedHashMap<>();
        changed.put(setId, newIo);
        Set<String> done = new HashSet<>(List.of(setId));
        while (!pending.isEmpty()) {
            String pid = pending.stream().filter(p -> done.containsAll(below.get(p))).findFirst().orElse(pending.get(0));
            pending.remove(pid);
            done.add(pid);
            List<Caller> rows = rowsOf.get(pid).values().stream()
                    .filter(c -> SetCallIoReader.callIds(c.ver()).stream().anyMatch(changed::containsKey)).toList();
            Caller propagate = rows.stream().filter(c -> RuleVersions.isCurrentReleased(c.ver(), at)).findFirst().orElse(null);
            for (Caller c : rows) {
                String label = rows.size() == 1 ? pid : pid + " " + VersionNumbers.label(c.ver().getVer());
                SetCallIo pAfter = recheckOne(snap, c, label, changed, at, rejects, warned);
                if (c == propagate && pAfter != null) {
                    changed.put(pid, pAfter);
                }
            }
        }
        return new Outcome(List.copyOf(rejects.values()), List.copyOf(warned));
    }

    /** 부르는 쪽 행 하나를 두 번 검사한다. 이 부모의 겉모양이 바뀌었으면({@link #shapeChanged}) 바뀐 겉모양, 아니면(또는 흐름을 못 읽으면) null. */
    private SetCallIo recheckOne(SetCallIoReader.Snapshot snap, Caller c, String label, Map<String, SetCallIo> changed, LocalDateTime at,
            Map<List<String>, RuleSetCheck> rejects, Set<String> warned) {
        String pid = c.setId();
        FlowDefinition flow;
        try {
            flow = RuleSetVersionQueries.flow(c.ver());
        } catch (IllegalArgumentException e) {
            return null;
        }
        Map<String, RuleIo> rules = ioReader.readAt(RuleSetFlowJson.ruleIds(flow), at, snap.scope());
        Map<String, CondIo> condIo = ioReader.condIo(flow, snap.scope());
        Map<String, SetCallIo> before = snap.callsOf(flow, at);
        Map<String, SetCallIo> after = new LinkedHashMap<>(before);
        changed.forEach((id, io) -> {
            if (after.containsKey(id)) {
                after.put(id, io);
            }
        });
        Set<List<String>> was = new HashSet<>();
        RuleSetAnalyzer.checks(flow, rules, condIo, before).forEach(k -> was.add(key(k)));
        for (RuleSetCheck k : RuleSetAnalyzer.checks(flow, rules, condIo, after)) {
            if (was.contains(key(k))) {
                continue;
            }
            if (k.rejected() || RuleSetCheck.CALL_CODES.contains(k.code())) {
                RuleSetCheck broken = new RuleSetCheck(RuleSetCheck.CALLER_BROKEN, RuleSetCheck.REJECT, pid, null, null, "세트 " + label + ": " + k.message());
                rejects.putIfAbsent(List.of(broken.message()), broken);
            } else {
                warned.add(pid);
            }
        }
        String name = c.parent().getMaruRuleSetName();
        String status = c.parent().getStatus();
        SetCallIo pBefore = RuleSetInterface.of(pid, name, true, status, flow, rules, before);
        SetCallIo pAfter = RuleSetInterface.of(pid, name, true, status, flow, rules, after);
        return shapeChanged(pBefore, pAfter) ? pAfter : null;
    }

    private static List<String> key(RuleSetCheck c) {
        return Arrays.asList(c.code(), c.message(), c.nodeId(), c.edgeId());
    }
}
