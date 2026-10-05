package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIoReader;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleSetInterface;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.rule.SetCallIo;
import com.dongkuk.dmes.mdm.common.rule.SetCallIoReader;
import com.dongkuk.dmes.mdm.common.rule.SetCallerRecheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 룰 저장·확정 때 부르는 세트 재검사(하위 세트 spec §6.4, srv:6 조정 ③). 이 룰을 담은 세트 S(폐기 아님)의 기준 시각에 적용 중인 RELEASED 버전마다,
 * 이 룰만 저장하려는 정의로 바꿔 S 의 겉모양을 다시 계산한다. 겉모양이 바뀌면 {@link SetCallerRecheck} 로 S 를 부르는 세트들(조부모까지)을 다시 검사해
 * 새 거부마다 {@code SET_CALLER_BROKEN}("세트 S 를 부르는 세트 P: …") 이슈를 낸다.
 *
 * <ul>
 *   <li>수준은 적용 지점으로 가른다: 확정({@link RuleSaveTarget#STORED}, 기준 시각 = 요청한 apply_from)은 ERROR(확정 거부), DRAFT 저장
 *       ({@link RuleSaveTarget#TABLE}·{@link RuleSaveTarget#COLUMNS}, 기준 시각 = 지금)은 WARNING(저장 통과).</li>
 *   <li>S 의 버전은 기준 시각에 적용 중인 것만 본다 — 부르는 세트가 그 시각에 보는 겉모양({@link SetCallIoReader#read})과 견줘야 버전 차이가 깨짐으로
 *       잡히지 않는다. 부르는 쪽 행이 없는 S, 흐름을 읽지 못하는 S 버전은 계산하지 않는다.</li>
 *   <li>다른 룰은 기준 시각의 RELEASED({@link RuleIoReader#readAt}, spec §6.4). 저장하려는 정의의 입출력({@link RuleIoReader#draft})은 부르는 세트가
 *       있는 S 를 찾은 뒤에만 계산한다.</li>
 *   <li>새 경고만 생긴 부모는 이슈로 내지 않는다(세트 확정의 CALLER_WARN 은 세트 쪽 몫).</li>
 * </ul>
 * 순서 번호 9 — 세트 순서·계약 변경 같은 가벼운 원장 검사 뒤, 가장 무거운 이 검사가 맨 뒤에 돈다(지금 쓰는 번호 1~6·8 다음).
 */
@Component
@Order(9)
public class RuleSetCallerCheck implements RuleSaveCheck {

    private final RuleQueries queries;
    private final RuleSetVersionQueries setVersions;
    private final MdmRuleRepository rules;
    private final RuleIoReader ioReader;
    private final SetCallIoReader callReader;
    private final SetCallerRecheck recheck;
    private final Clock clock;

    public RuleSetCallerCheck(RuleQueries queries, RuleSetVersionQueries setVersions, MdmRuleRepository rules, RuleIoReader ioReader,
                              SetCallIoReader callReader, SetCallerRecheck recheck, Clock clock) {
        this.queries = queries;
        this.setVersions = setVersions;
        this.rules = rules;
        this.ioReader = ioReader;
        this.callReader = callReader;
        this.recheck = recheck;
        this.clock = clock;
    }

    @Override
    public Set<RuleSaveTarget> targets() {
        return EnumSet.of(RuleSaveTarget.TABLE, RuleSaveTarget.COLUMNS, RuleSaveTarget.STORED);
    }

    @Override
    public List<Map<String, Object>> check(RuleSaveContext ctx) {
        String me = ctx.ruleId();
        LocalDateTime at = ctx.referenceTime() != null ? ctx.referenceTime() : LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        List<MdmRuleSet> parents = queries.allSets().stream().filter(s -> !"DEPRECATED".equals(s.getStatus())).toList();
        if (parents.isEmpty()) {
            return List.of();
        }
        Map<String, List<MdmRuleSetVer>> byId = setVersions.versionsOf(parents.stream().map(MdmRuleSet::getMaruRuleSetId).toList());
        String severity = ctx.target() == RuleSaveTarget.STORED ? RuleCheckReport.ERROR : RuleCheckReport.WARNING;
        SetCallIoReader.Snapshot snap = null;
        RuleIo draft = null;
        Set<String> messages = new LinkedHashSet<>();
        for (MdmRuleSet set : parents) {
            String sid = set.getMaruRuleSetId();
            Optional<MdmRuleSetVer> cur = RuleVersions.currentReleased(byId.getOrDefault(sid, List.of()), at);
            if (cur.isEmpty() || !RuleSetVersionQueries.members(cur.get()).contains(me)) {
                continue;
            }
            FlowDefinition flow;
            try {
                flow = RuleSetVersionQueries.flow(cur.get());
            } catch (IllegalArgumentException e) {
                continue;
            }
            if (snap == null) {
                snap = callReader.snapshot();
            }
            if (snap.callers(sid, at).isEmpty()) {
                continue;
            }
            if (draft == null) {
                Optional<MdmRule> rule = rules.findById(me);
                if (rule.isEmpty()) {
                    return List.of();
                }
                draft = ioReader.draft(rule.get(), ctx.ver(), ctx.hitPolicy(), ctx.rawVars(), ctx.rows(), snap.scope());
            }
            SetCallIo before = snap.read(List.of(sid), at).get(sid);
            Map<String, RuleIo> withDraft = new LinkedHashMap<>(ioReader.readAt(RuleSetFlowJson.ruleIds(flow), at, snap.scope()));
            withDraft.put(me, draft);
            SetCallIo after = RuleSetInterface.of(sid, before.setName(), true, before.status(), flow, withDraft, snap.callsOf(flow, at));
            if (after.sameShape(before)) {
                continue;
            }
            for (RuleSetCheck r : recheck.recheck(sid, after, at).rejects()) {
                messages.add("세트 " + sid + " 를 부르는 " + r.message());
            }
        }
        List<Map<String, Object>> out = new ArrayList<>(messages.size());
        messages.forEach(m -> out.add(RuleCheckReport.issue(RuleSaveIssueCode.SET_CALLER_BROKEN.name(), severity, List.of(), null, m)));
        return out;
    }
}
