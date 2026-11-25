package com.dongkuk.dmes.mqc.qcd.rule.mdm;

import com.dongkuk.dmes.cactus.mdm.MdmUnavailableException;
import com.dongkuk.dmes.mqc.qcd.rule.domain.QcdRuleGateway;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.rule.RuleEngine;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * MDM 캐시가 꺼진 실행(cactus.mdm.enabled=false 이거나 없음 — 시험 앱)에서의 대체. 모든 호출이 MdmUnavailableException 이다.
 * 조건은 {@link MdmQcdRuleGateway} 와 정확히 반대인 속성 조건이라 두 게이트웨이는 늘 하나만 선다.
 */
@Configuration
public class UnavailableQcdRuleGateway {

    @Bean
    @ConditionalOnProperty(prefix = "cactus.mdm", name = "enabled", havingValue = "false", matchIfMissing = true)
    public QcdRuleGateway unavailableQcdRuleGateway() {
        return new QcdRuleGateway() {
            @Override public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) { throw unavailable(); }
            @Override public List<RuleVersion> versions(String ruleId) { throw unavailable(); }
            @Override public Optional<RuleDefinition> ruleAt(String ruleId, String ver) { throw unavailable(); }
            @Override public RuleEngine engine() { throw unavailable(); }
            @Override public Optional<CodeRows> code(String maruCodeId) { throw unavailable(); }
            @Override public Optional<CodeRows> codeAt(String maruCodeId, java.math.BigDecimal ver) { throw unavailable(); }
            private MdmUnavailableException unavailable() {
                return new MdmUnavailableException("MDM 메타 캐시가 꺼져 있다(cactus.mdm.enabled=false)");
            }
        };
    }
}
