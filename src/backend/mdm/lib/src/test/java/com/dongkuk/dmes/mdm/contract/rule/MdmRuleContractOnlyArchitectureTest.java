package com.dongkuk.dmes.mdm.contract.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleRowRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleTestCaseRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVarRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVerRepository;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-08-01 design.md §3.7 — "실행 로직 없음(contract-only)" 정적 가드. 06 리포지토리 6개가 메서드를 선언하지 않는다.
 * 조회는 {@code common.rule.RuleQueries}(JPQL)에 모은다(TSK-08-02 D12 — 이 가드는 유지한다).
 *
 * <p>06 식별자 발급기 구현이 main 에 없다는 규칙과 그 공허 통과 방지 표본은 TSK-08-02 가 발급기
 * ({@code DefaultMdmRuleIdIssuer})를 넣으며 지웠다(TSK-08-01 design.md §7 의 해제 조건).
 */
class MdmRuleContractOnlyArchitectureTest {

    private static final List<Class<?>> RULE_REPOSITORIES = List.of(
            MdmRuleRepository.class, MdmRuleVerRepository.class, MdmRuleVarRepository.class,
            MdmRuleRowRepository.class, MdmRuleTestCaseRepository.class, MdmRuleSetRepository.class);

    @Test
    void _06_리포지토리는_메서드를_선언하지_않는다() {
        for (Class<?> repository : RULE_REPOSITORIES) {
            assertEquals(0, repository.getDeclaredMethods().length,
                    repository.getSimpleName() + " 이 메서드를 선언했다: " + Arrays.toString(repository.getDeclaredMethods()));
        }
    }
}
