package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionEvaluator;
import org.junit.jupiter.api.Test;

/**
 * §4 AC #6(design.md) — mdm 모듈이 composite build 로 maru-mdm-engine 을 실제로 참조·링크하는지
 * 컴파일+런타임 양쪽에서 증명한다. {@code mdm/settings.gradle} 의
 * {@code includeBuild('../maru-mdm-engine')} 를 지우면 이 클래스는 컴파일 자체가 실패해야 한다.
 */
class MdmEngineDependencySmokeTest {

    @Test
    void mdm_lib_가_엔진의_ExpressionEvaluator를_직접_호출한다() {
        ExpressionEvaluator evaluator = new ExpressionEvaluator();

        BigDecimal result = evaluator.evaluate("10 + 5");

        assertEquals(0, new BigDecimal("15").compareTo(result));
    }
}
