package com.dongkuk.dmes.mqc.qcd.rule.mdm;

import com.dongkuk.dmes.cactus.mdm.MdmDefinitionLookup;
import com.dongkuk.dmes.cactus.mdm.MdmMetaService;
import com.dongkuk.dmes.cactus.mdm.MdmTargetType;
import com.dongkuk.dmes.cactus.mdm.MdmToc;
import com.dongkuk.dmes.cactus.mdm.MdmVersions;
import com.dongkuk.dmes.mqc.qcd.rule.domain.QcdRuleGateway;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.rule.RuleEngine;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 운영 게이트웨이 — 업무 모듈 캐시(MdmDefinitionLookup) 위에 룰 엔진을 만든다(Backend-Implementation-Guide §11).
 * cactus 는 엔진 빈을 내놓지 않으므로 여기서 만든다. 캐시에 없으면 MDM 을 부르고, 못 받으면 MdmUnavailableException 이 올라간다.
 *
 * <p>조건은 OnBean 이 아니라 속성이다. 스캔된 사용자 빈의 OnBean 조건은 자동 설정(MdmAutoConfiguration)이 빈 정의를 등록하기 전에
 * 평가돼 캐시가 켜진 앱에서도 이 빈이 빠질 수 있다. 자동 설정과 같은 속성({@code cactus.mdm.enabled=true})으로 켠다.
 */
@Component
@ConditionalOnProperty(prefix = "cactus.mdm", name = "enabled", havingValue = "true")
public class MdmQcdRuleGateway implements QcdRuleGateway {

    private final MdmDefinitionLookup lookup;
    private final MdmMetaService meta;
    private final RuleEngine engine;

    public MdmQcdRuleGateway(MdmDefinitionLookup lookup, MdmMetaService meta) {
        this.lookup = lookup;
        this.meta = meta;
        this.engine = new MdmRuleEngine(
                new MdmEvaluator(new EngineLookups(lookup, lookup, lookup, MasterLookup.NONE, FunctionProvider.NONE)), lookup);
    }

    @Override public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) { return lookup.rule(ruleId, evalTs); }

    @Override public List<RuleVersion> versions(String ruleId) {
        return meta.toc(MdmTargetType.RULE, ruleId).map(MdmToc::versions).orElse(List.of()).stream()
                .map(v -> new RuleVersion(MdmVersions.key(v.ver()), v.applyFrom(), v.applyTo())).toList();
    }

    @Override public Optional<RuleDefinition> ruleAt(String ruleId, String ver) {
        return meta.body(MdmTargetType.RULE, ruleId, MdmVersions.key(ver))
                .filter(RuleDefinition.class::isInstance).map(RuleDefinition.class::cast);
    }

    @Override public RuleEngine engine() { return engine; }

    @Override public Optional<CodeRows> code(String maruCodeId) { return lookup.code(maruCodeId); }

    @Override public Optional<CodeRows> codeAt(String maruCodeId, java.math.BigDecimal ver) { return lookup.codeAt(maruCodeId, ver); }
}
