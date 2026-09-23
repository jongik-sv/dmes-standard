package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionEvaluator;
import org.junit.jupiter.api.Test;

/**
 * §4 AC #6(design.md) — mdm 모듈이 composite build 로 maru-mdm-engine 을 실제로 참조·링크하는지
 * 컴파일+런타임 양쪽에서 증명한다.
 *
 * <p><b>변이 검증 재확인(Build Phase 이탈 기록 참고)</b> — {@code mdm/lib/build.gradle} 의
 * {@code api 'kr.dongkuk.maru.mdm:maru-mdm-engine'} 의존 선언을 지우면 이 클래스는 (standalone·
 * root testAll 양쪽 모두) 컴파일 자체가 실패한다 — 이 변이가 실질적인 가드다. 반면
 * {@code mdm/settings.gradle} 의 {@code includeBuild('../maru-mdm-engine')} 만 지우는 변이는
 * standalone(`cd mdm && ../gradlew`)에서는 컴파일이 깨지지만, {@code src/backend} 루트
 * {@code testAll} 아래에서는 루트 자신의 {@code includeBuild('maru-mdm-engine')}
 * dependencySubstitution 이 전역으로 적용돼 초록으로 남는다(재검증 확인, 2026-09-24) — composite
 * substitution 은 빌드 경계를 넘어 전역이라는 것을 보여준다.
 */
class MdmEngineDependencySmokeTest {

    @Test
    void mdm_lib_가_엔진의_ExpressionEvaluator를_직접_호출한다() {
        ExpressionEvaluator evaluator = new ExpressionEvaluator();

        BigDecimal result = evaluator.evaluate("10 + 5");

        assertEquals(0, new BigDecimal("15").compareTo(result));
    }
}
