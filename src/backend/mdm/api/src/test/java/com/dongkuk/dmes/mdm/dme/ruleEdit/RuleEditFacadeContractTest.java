package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleColumnsService;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditService;
import java.lang.reflect.Method;
import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

/**
 * TSK-08-03 design §5 불변 11 — OASIS 파사드에는 {@code @Transactional} 을 붙이지 않고(I25, 파라미터 이름 바인딩이 깨진다),
 * {@code ResolvedVar} 의 칼럼 이름·순서는 08-03·08-04 가 그대로 쓰므로 고정한다. 원자성은 파트가 TransactionTemplate 으로 준다.
 */
class RuleEditFacadeContractTest {

    @Test
    void 파사드와_COLUMNS_파트에는_Transactional_을_붙이지_않는다() {
        for (Class<?> type : List.of(RuleEditService.class, RuleColumnsService.class)) {
            assertFalse(type.isAnnotationPresent(Transactional.class), type.getSimpleName() + " 클래스에 @Transactional");
            for (Method m : type.getDeclaredMethods()) {
                assertFalse(m.isAnnotationPresent(Transactional.class), type.getSimpleName() + "#" + m.getName() + " 에 @Transactional");
            }
        }
    }

    @Test
    void ResolvedVar_칼럼_이름과_순서는_고정이다() {
        List<String> names = Arrays.stream(ResolvedVar.class.getRecordComponents()).map(RecordComponent::getName).toList();
        assertEquals(List.of("varId", "varKind", "dispType", "seq", "varName", "exprVar", "label", "dataType", "scale",
                "dateString", "maruCodeId", "domainId", "domainName", "typeSource", "description"), names);
    }
}
