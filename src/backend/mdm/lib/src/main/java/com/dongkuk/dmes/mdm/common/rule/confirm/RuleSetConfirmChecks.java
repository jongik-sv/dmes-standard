package com.dongkuk.dmes.mdm.common.rule.confirm;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.CondIo;
import com.dongkuk.dmes.mdm.common.rule.RuleCaseJudge;
import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIoReader;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCallGraph;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCaseJudge;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleSetInterface;
import com.dongkuk.dmes.mdm.common.rule.RuleSetRunner;
import com.dongkuk.dmes.mdm.common.rule.SetCallIo;
import com.dongkuk.dmes.mdm.common.rule.SetCallIoReader;
import com.dongkuk.dmes.mdm.common.rule.SetCallerRecheck;
import com.dongkuk.dmes.mdm.common.rule.RuleSetTestCaseQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetTestCase;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.SortedMap;
import java.util.TreeMap;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.springframework.stereotype.Component;

/**
 * 룰 세트 확정 검사 컴포넌트(D-144 2단계) — 원장을 읽어 순수 보고서({@link RuleSetConfirmReport}·{@link RuleSetVersionDiffs})에 넘긴다.
 * 확정 트랜잭션 안에서 불리므로 쓰지 않는다. 화면 서비스는 SPI 가 아니라 이 컴포넌트를 주입받는다(룰 RuleConfirmChecks 와 같은 이유, I16).
 */
@Component
public class RuleSetConfirmChecks {

    private final RuleSetVersionQueries setVersions;
    private final RuleQueries ruleQueries;
    private final RuleIoReader ioReader;
    private final RuleSetTestCaseQueries caseQueries;
    private final RuleSetRunner runner;
    private final SetCallIoReader callReader;
    private final SetCallerRecheck recheck;

    public RuleSetConfirmChecks(RuleSetVersionQueries setVersions, RuleQueries ruleQueries, RuleIoReader ioReader,
                                RuleSetTestCaseQueries caseQueries, RuleSetRunner runner, SetCallIoReader callReader, SetCallerRecheck recheck) {
        this.setVersions = setVersions;
        this.ruleQueries = ruleQueries;
        this.ioReader = ioReader;
        this.caseQueries = caseQueries;
        this.runner = runner;
        this.callReader = callReader;
        this.recheck = recheck;
    }

    /**
     * 4항목 보고서. 1·3 은 applyFrom 시점 RELEASED 룰 버전의 입출력으로, 4 는 케이스 EVAL_TS(없으면 applyFrom)로 판정한다(J7·J8). 1·3 은 applyFrom
     * 뒤 경계 시각(멤버 룰 RELEASED 의 APPLY_FROM)마다 다시 돌려 새로 나온 이슈를 WARNING 으로 더한다(Ruling P2-14 — 예약된 미래 룰 버전이 세트를
     * 깨는 경우). SET 노드는 apply_from 기준 하위 세트 겉모양({@link SetCallIoReader})으로 보고(경계 시각은 그 시각 겉모양), 항목 1 에 호출 그래프·연쇄
     * 재검사({@link #callChecks})를 더한다(하위 세트 spec §5·§6.1, srv:6 조정 ②).
     *
     * @param applyFrom 확정 적용 시각 — 필수. null 을 "지금"으로 읽지 않는다(룰 {@code RuleConfirmChecks.report} 와 다르다). 호출자(공통 확정 서비스·
     *                  확정 화면)가 먼저 검증한다
     * @throws NullPointerException applyFrom 이 null
     * @throws BusinessException 그 세트 버전이 없음(INVALID_VALUE)
     */
    public RuleSetConfirmReport.Report report(VersionRef draft, LocalDateTime applyFrom) {
        Objects.requireNonNull(applyFrom, "룰 세트 확정 검사의 적용 시각(applyFrom)은 필수입니다");
        String setId = draft.objectId();
        MdmRuleSetVer v = version(setId, draft.ver());
        FlowDefinition stored;
        try {
            stored = v.getFlowJson() == null ? null : RuleSetFlowJson.parse(v.getFlowJson());
        } catch (IllegalArgumentException e) {
            return RuleSetConfirmReport.storedFlowCorrupt(draft, e.getMessage());
        }
        List<String> ids = stored == null ? RuleSetVersionQueries.members(v) : RuleSetFlowJson.ruleIds(stored);
        SetCallIoReader.Snapshot snap = callReader.snapshot();
        RuleVarTypeResolver.Scope scope = snap.scope();
        Map<String, CondIo> condIo = stored == null ? null : ioReader.condIo(stored, scope);
        Map<String, RuleIo> io = ioReader.readAt(ids, applyFrom, scope);
        Map<String, SetCallIo> calls = stored == null ? Map.of() : snap.callsOf(stored, applyFrom);
        List<RuleSetCheck> checks = new ArrayList<>(flowChecks(stored, ids, io, condIo, calls));
        checks.addAll(callChecks(snap, setId, stored == null ? FlowParser.linear(ids) : stored, io, calls, applyFrom, checks));
        List<RuleSetConfirmReport.FutureChecks> future = new ArrayList<>();
        boundaries(ids, applyFrom).forEach((at, causes) -> future.add(new RuleSetConfirmReport.FutureChecks(at, causes,
                flowChecks(stored, ids, ioReader.readAt(ids, at, scope), condIo, stored == null ? Map.of() : snap.callsOf(stored, at)))));
        List<String> notReleased = ids.stream().filter(id -> io.get(id) != null && io.get(id).exists() && io.get(id).releasedVer() == null).toList();
        List<Map<String, Object>> cases = List.of();
        String caseFailure = null;
        try {
            cases = cases(setId, stored == null ? FlowParser.linear(ids) : stored, applyFrom);
        } catch (RuntimeException e) {
            caseFailure = String.valueOf(e.getMessage());
        }
        return RuleSetConfirmReport.report(draft, checks, future, notReleased, applyFrom, cases, caseFailure,
                caseFailed(cases, caseFailure) ? ownerDraftRules(ids, v.getOwnerId()) : List.of());
    }

    /** 안내가 붙을 실패가 있는가 — 기대값 있는 케이스의 pass=false 또는 일괄 실행 실패. 없으면 원장을 더 읽지 않는다. */
    private static boolean caseFailed(List<Map<String, Object>> cases, String caseFailure) {
        return caseFailure != null || cases.stream().anyMatch(c -> Boolean.FALSE.equals(c.get("pass"))
                && !Boolean.FALSE.equals(c.get(RuleSetConfirmReport.HAS_EXPECTED)));
    }

    /** 흐름 룰 가운데 {@code owner} 의 DRAFT 가 있는 룰 ID(흐름 순서, spec 2026-10-06 §6). 작성자가 없으면 빈 목록. */
    private List<String> ownerDraftRules(List<String> ids, String owner) {
        if (owner == null || ids.isEmpty()) {
            return List.of();
        }
        Set<String> drafted = new HashSet<>();
        for (MdmRuleVer r : ruleQueries.versionsOf(ids)) {
            if (VersionStatus.DRAFT.name().equals(r.getStatus()) && owner.equals(r.getOwnerId())) {
                drafted.add(r.getMaruRuleId());
            }
        }
        return ids.stream().distinct().filter(drafted::contains).toList();
    }

    /**
     * 흐름 diff — base 는 {@link #previousReleased}(없으면 null, 최초 버전). 세트 버전이 없으면 INVALID_VALUE, 저장된 흐름(대상·base)을 읽지 못하면
     * {@link MdmErrorCode#STORED_DEFINITION_CORRUPT} 업무 예외(화면이 500 을 내지 않게).
     */
    public VersionDiff diff(VersionRef draft) {
        String setId = draft.objectId();
        MdmRuleSetVer target = version(setId, draft.ver());
        Optional<MdmRuleSetVer> previous = previousReleased(setId, target.getVer());
        VersionRef baseRef = previous.map(p -> new VersionRef(VersionTarget.RULE_SET, setId, VersionNumbers.scaled(p.getVer()))).orElse(null);
        return new VersionDiff(baseRef, draft, RuleSetVersionDiffs.diff(previous.map(RuleSetConfirmChecks::flow).orElse(null), flow(target)));
    }

    /** 직전 RELEASED = STATUS RELEASED 이고 ver < V 인 것 중 가장 큰 ver. 공통 서비스(DefaultVersionStateService.previousReleased)와 같은 판정. */
    public Optional<MdmRuleSetVer> previousReleased(String setId, BigDecimal ver) {
        return setVersions.versions(setId).stream()
                .filter(v -> VersionStatus.RELEASED.name().equals(v.getStatus()) && v.getVer().compareTo(ver) < 0)
                .findFirst();   // versions 는 VER 내림차순
    }

    private MdmRuleSetVer version(String setId, BigDecimal ver) {
        return setVersions.find(setId, ver).orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE,
                "룰 세트 " + setId + " 에 버전 " + VersionNumbers.label(ver) + " 이(가) 없습니다"));
    }

    private static FlowDefinition flow(MdmRuleSetVer v) {
        try {
            return RuleSetVersionQueries.flow(v);
        } catch (IllegalArgumentException e) {
            throw MdmErrors.of(MdmErrorCode.STORED_DEFINITION_CORRUPT, "룰 세트 " + v.getMaruRuleSetId() + " " + VersionNumbers.label(v.getVer())
                    + " 의 저장된 흐름을 읽을 수 없습니다 — " + e.getMessage(), List.of());
        }
    }

    /** 검사 1·3 — FLOW_JSON 이 없으면 목록 입력, 있으면 흐름 입력(SET 노드는 calls 의 겉모양으로, 하위 세트 spec §5). */
    private static List<RuleSetCheck> flowChecks(FlowDefinition stored, List<String> ids, Map<String, RuleIo> io, Map<String, CondIo> condIo,
            Map<String, SetCallIo> calls) {
        return stored == null ? RuleSetAnalyzer.checks(ids, io) : RuleSetAnalyzer.checks(stored, io, condIo, calls);
    }

    /**
     * 하위 세트 호출 검사(하위 세트 spec §5·§6.1, srv:6 조정 ②) — 기준 시각은 확정하려는 apply_from.
     * <ol>
     *   <li>호출 그래프: 부르는 쪽 행({@link SetCallIoReader.Snapshot#edges})에서 이 세트 자리를 확정하려는 흐름의 SET 목록으로 덮어(빈 목록도) 순환·깊이를
     *       본다(CALL_CYCLE·CALL_DEPTH).</li>
     *   <li>연쇄 재검사: 앞(흐름 검사·그래프)에 확정을 막는 검사가 없고, 이 세트를 부르는 쪽 행이 있고, 지금 겉모양(apply_from 에 적용 중인 RELEASED)이
     *       있으며 확정하려는 겉모양과 다르면({@link SetCallerRecheck#shapeChanged} — 입출력 또는 endsEarly) 같은 원장 읽기로 {@link SetCallerRecheck} — 새 거부는 CALLER_BROKEN, 새 경고가 생긴 부모가 있으면 CALLER_WARN 한 건
     *       ("부르는 세트에 경고가 생겼다: P1, P2", Ruling 10). 첫 확정(지금 겉모양 없음)은 하지 않는다.</li>
     * </ol>
     * 네 코드의 수준은 보고서가 ERROR 로 올린다({@link RuleSetConfirmReport#rejects}).
     *
     * @param flow   확정하려는 흐름(FLOW_JSON 이 없으면 RULE_IDS 한 줄 흐름 — 목록 세트도 SET 노드로 불릴 수 있다)
     * @param before 이미 낸 흐름 검사(연쇄 재검사를 할지 정한다)
     */
    private List<RuleSetCheck> callChecks(SetCallIoReader.Snapshot snap, String setId, FlowDefinition flow, Map<String, RuleIo> io,
            Map<String, SetCallIo> calls, LocalDateTime applyFrom, List<RuleSetCheck> before) {
        Map<String, List<String>> edges = new LinkedHashMap<>(snap.edges(applyFrom));
        edges.put(setId, RuleSetFlowJson.setIds(flow));
        List<RuleSetCheck> out = new ArrayList<>(RuleSetCallGraph.check(setId, edges));
        if (out.stream().anyMatch(RuleSetConfirmReport::rejects) || before.stream().anyMatch(RuleSetConfirmReport::rejects)
                || snap.callers(setId, applyFrom).isEmpty()) {
            return out;
        }
        SetCallIo current = snap.read(List.of(setId), applyFrom).get(setId);
        if (current == null || !current.exists()) {
            return out;
        }
        SetCallIo next = RuleSetInterface.of(setId, current.setName(), true, current.status(), flow, io, calls);
        if (!SetCallerRecheck.shapeChanged(current, next)) {
            return out;
        }
        SetCallerRecheck.Outcome o = recheck.recheck(snap, setId, next, applyFrom);
        out.addAll(o.rejects());
        if (!o.warnedCallers().isEmpty()) {
            out.add(new RuleSetCheck(RuleSetCheck.CALLER_WARN, RuleSetCheck.WARN, setId, null, null,
                    "부르는 세트에 경고가 생겼다: " + String.join(", ", o.warnedCallers())));
        }
        return out;
    }

    /**
     * applyFrom 뒤 경계 시각 → 그 시각에 적용되기 시작하는 멤버 룰 RELEASED 버전 표기({@code R_X v2.000}), 시각 오름차순. 경계는 멤버 룰 RELEASED 의
     * APPLY_FROM 가운데 applyFrom 보다 뒤인 것(중복 없음, Ruling P2-14).
     */
    private SortedMap<LocalDateTime, List<String>> boundaries(List<String> ids, LocalDateTime applyFrom) {
        SortedMap<LocalDateTime, List<String>> out = new TreeMap<>();
        if (ids.isEmpty()) {
            return out;
        }
        for (MdmRuleVer r : ruleQueries.versionsOf(ids)) {
            if (VersionStatus.RELEASED.name().equals(r.getStatus()) && r.getApplyFrom() != null && r.getApplyFrom().isAfter(applyFrom)) {
                out.computeIfAbsent(r.getApplyFrom(), k -> new ArrayList<>()).add(r.getMaruRuleId() + " " + VersionNumbers.label(r.getVer()));
            }
        }
        return out;
    }

    private List<Map<String, Object>> cases(String setId, FlowDefinition flow, LocalDateTime applyFrom) {
        List<MdmRuleSetTestCase> list = caseQueries.cases(setId);
        if (list.isEmpty()) {
            return List.of();
        }
        RuleSetRunner.Session session = runner.session();
        Instant fallback = applyFrom.atZone(MdmClockConfig.KST).toInstant();
        List<Map<String, Object>> out = new ArrayList<>(list.size());
        for (MdmRuleSetTestCase c : list) {
            Map<String, Object> record = RuleCaseJudge.object(c.getInputJson());
            if (record == null) {
                Map<String, Object> bad = new LinkedHashMap<>();
                bad.put("caseId", c.getCaseId());
                bad.put("caseName", c.getCaseName());
                bad.put("outcome", "ERROR");
                bad.put("pass", false);
                bad.put("mismatches", List.of());
                bad.put("errors", List.of(Map.of("message", "입력 JSON 이 객체가 아닙니다")));
                bad.put(RuleSetConfirmReport.HAS_EXPECTED, hasExpected(c));
                out.add(bad);
                continue;
            }
            Instant ts = c.getEvalTs() == null ? fallback : RuleSetRunner.parseKst(c.getEvalTs());
            RunTrace trace = session.traceDefinition(setId, flow, record, ts);
            Map<String, Object> judged = RuleSetCaseJudge.judge(c.getCaseId(), c.getCaseName(), c.getExpectedJson(), trace);
            judged.put(RuleSetConfirmReport.HAS_EXPECTED, hasExpected(c));
            out.add(judged);
        }
        return out;
    }

    /** 기대값이 있는 케이스인가 — 없으면(실행만) 실행 오류가 나도 확정을 막지 않는다(스펙 §6 항목 4, Ruling P2-22). */
    private static boolean hasExpected(MdmRuleSetTestCase c) {
        return c.getExpectedJson() != null && !c.getExpectedJson().isBlank();
    }
}
