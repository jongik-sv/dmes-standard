package com.dongkuk.dmes.mcm.arch;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

/**
 * mcm-core 의 의존 방향 / 패키지 사이클 자동 검증 — 04 §0 정책 적용 (Phase 8-5).
 *
 * <p>강제 사항:
 * <ul>
 *   <li>mcm-core 는 cactus / oasis / aps / 호스트 런처 패키지를 import 하지 않는다(예약 작업 `mcm.job..` 제외).</li>
 *   <li>mcm-core 내부 패키지 간 사이클이 없다.</li>
 * </ul>
 */
class McmCoreArchitectureTest {

    private static final JavaClasses MCM_CORE = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.dongkuk.dmes.mcm");

    @Test
    void mcm_core_는_cactus_패키지를_의존하지_않는다() {
        ArchRule rule = noClasses().that().resideInAPackage("com.dongkuk.dmes.mcm..")
                .and().resideOutsideOfPackage("com.dongkuk.dmes.mcm.job..")
                .should().dependOnClassesThat().resideInAPackage("com.dongkuk.dmes.cactus..")
                .as("mcm-core 는 cactus-core 를 의존하지 않아야 한다 (04 §0 정책) — 예약 작업 mcm.job.. 만 예외(2026-10-09, 예약 작업 설계 D1)");
        rule.check(MCM_CORE);
    }

    @Test
    void mcm_core_는_oasis_패키지를_의존하지_않는다() {
        ArchRule rule = noClasses().that().resideInAPackage("com.dongkuk.dmes.mcm..")
                .and().resideOutsideOfPackage("com.dongkuk.dmes.mcm.job..")
                .should().dependOnClassesThat().resideInAPackage("com.dongkuk.oasis..")
                .as("mcm-core 는 oasis-core 를 의존하지 않아야 한다 — 예약 작업 mcm.job.. 만 예외");
        rule.check(MCM_CORE);
    }

    @Test
    void mcm_core_는_aps_패키지를_의존하지_않는다() {
        ArchRule rule = noClasses().that().resideInAPackage("com.dongkuk.dmes.mcm..")
                .should().dependOnClassesThat().resideInAPackage("com.dongkuk.dmes.aps..")
                .as("mcm-core 는 aps-core 를 의존하지 않아야 한다");
        rule.check(MCM_CORE);
    }

    /**
     * mcm-core(라이브러리)가 호스트 런처(mcm 모듈)를 역참조하지 않는지 검증.
     *
     * <p>본 템플릿은 라이브러리와 런처가 같은 root 패키지({@code com.dongkuk.dmes.mcm})를 공유하므로
     * root prefix 로는 구분되지 않는다. 대신 런처만 소유하는 하위 패키지를 열거해 막는다.
     * 런처에 하위 패키지를 추가하면 여기에도 함께 등재할 것.
     */
    @Test
    void mcm_core_는_호스트_런처_패키지를_의존하지_않는다() {
        ArchRule rule = noClasses().that().resideInAPackage("com.dongkuk.dmes.mcm..")
                .should().dependOnClassesThat().resideInAnyPackage(
                        "com.dongkuk.dmes.mcm.init..",      // DataInitializer
                        "com.dongkuk.dmes.mcm.listener..",  // 이벤트 리스너
                        "com.dongkuk.dmes.mcm.adapter..",   // cactus 어댑터
                        "com.dongkuk.dmes.mcm.domain..")    // 런처 컨트롤러/서비스
                .as("mcm-core 는 호스트 런처(mcm 모듈) 코드를 의존하지 않아야 한다");
        rule.check(MCM_CORE);
    }

    @Test
    void mcm_core_내부_패키지_사이클_없음() {
        ArchRule rule = slices()
                .matching("com.dongkuk.dmes.mcm.(*)..")
                .should().beFreeOfCycles()
                .as("mcm-core 내부 도메인 패키지 간 의존 사이클 금지");
        rule.check(MCM_CORE);
    }
}
