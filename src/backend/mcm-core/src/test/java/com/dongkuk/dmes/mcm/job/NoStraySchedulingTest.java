package com.dongkuk.dmes.mcm.job;

import com.dongkuk.dmes.mcm.job.server.JobDispatchTrigger;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;

/** 예약 작업은 DB 정의로 돌린다(설계 §6) — mcm-core 의 {@code @Scheduled} 는 매분 깨우는 판정 트리거 하나뿐이다. */
class NoStraySchedulingTest {

    @Test
    @DisplayName("mcm-core 에서 @Scheduled 가 붙은 메서드는 JobDispatchTrigger 에만 있다")
    void onlyTheDispatchTriggerIsScheduled() {
        ArchRule rule = methods().that().areAnnotatedWith(Scheduled.class).should().beDeclaredIn(JobDispatchTrigger.class);
        rule.check(new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS).importPackages("com.dongkuk.dmes.mcm"));
    }
}
