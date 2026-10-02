package com.dongkuk.dmes.mdm.common.engine;

import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * mdm 원장 서버의 엔진 평가기(TSK-04-03 design.md §3.7, D10). 평가기는 앱에 하나다 — 파싱 캐시를 모든 API 가 공유한다.
 *
 * <p>조회 구현은 빈이 있으면 쓰고 없으면 빈 구현을 넣는다: {@link CodeLookup} 은 늘 빈 값(04 원장 미구축, D2),
 * {@link MasterLookup#NONE}, {@link FunctionProvider#NONE}. 원장 서버는 {@link CodeEffLookup#NONE}. 검증 정의
 * ({@link DefinitionLookup})는 도메인 검증기에 호출자가 따로 주므로 여기서는 늘 빈 값이다.
 *
 * <p>규칙: 다른 작업은 {@code mdmEvaluator} 를 새로 만들지 않고 재사용하며 {@code CodeLookup}·{@code MasterLookup}·
 * {@code FunctionProvider} 빈만 등록한다. 스캔되는 설정의 {@code @ConditionalOnMissingBean} 은 등록 순서를 보장하지
 * 않으므로 보조 방어일 뿐이다.
 */
@Configuration
public class MdmEngineConfig {

    /** 코드 원장이 없을 때 — 어떤 마루 코드도 없다. {@code MASTER} 는 마루 데이터 대상({@link MasterLookup})으로 간다. */
    public static final CodeLookup EMPTY_CODES = id -> Optional.empty();

    /** 원장 서버 평가기용 — 검증 정의는 호출자가 검증기에 따로 준다. */
    public static final DefinitionLookup EMPTY_DEFINITIONS = new DefinitionLookup() {
        @Override
        public Optional<ColumnDefinition> column(String table, String column) {
            return Optional.empty();
        }

        @Override
        public Optional<RuleDefinition> rule(String ruleId, java.time.Instant evalTs) {
            return Optional.empty();
        }

        @Override
        public Optional<RuleSetDefinition> ruleSet(String setId, java.time.Instant evalTs) {
            return Optional.empty();
        }
    };

    /** null 인 조회는 빈 구현으로 채운다. 테스트도 이 한 곳으로 평가기를 만든다. */
    public static EngineLookups lookups(CodeLookup codes, MasterLookup masters, FunctionProvider functions) {
        return new EngineLookups(EMPTY_DEFINITIONS,
                codes != null ? codes : EMPTY_CODES,
                CodeEffLookup.NONE,
                masters != null ? masters : MasterLookup.NONE,
                functions != null ? functions : FunctionProvider.NONE);
    }

    @Bean
    @ConditionalOnMissingBean
    public MdmEvaluator mdmEvaluator(ObjectProvider<CodeLookup> codes, ObjectProvider<MasterLookup> masters,
                                     ObjectProvider<FunctionProvider> functions) {
        return new MdmEvaluator(lookups(codes.getIfAvailable(), masters.getIfAvailable(), functions.getIfAvailable()));
    }

    @Bean
    @ConditionalOnMissingBean
    public ExpressionChecker expressionChecker(MdmEvaluator mdmEvaluator) {
        return new ExpressionChecker(mdmEvaluator);
    }
}
