package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentResult;
import com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentStore;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * TSK-07-01 design.md §3.5·F17 — "실행 로직 없음"(수용 기준) 의 직접 증거. {@code lib}+{@code api} 양쪽
 * main 클래스를 함께 스캔해야 하는데({@code MdmTemporalSegmentStore} 는 {@code lib}, 실 구현체가 생긴다면
 * {@code api}), {@code api} 모듈의 테스트 클래스패스에는 둘 다 있다({@code api → lib} 의존 방향) — 그래서
 * 이 테스트를 {@code lib} 가 아니라 {@code api/src/test} 에 둔다.
 *
 * <p>ArchUnit 의 {@code JavaClasses}/{@code JavaClass} API 를 직접 써서 구현체를 찾는다(fluent
 * {@code noClasses().should(...)} DSL 대신) — 커스텀 {@code ArchCondition} 을 {@code noClasses()} 와
 * 조합했을 때 실측한 이벤트 극성이 기대와 반대로 동작해(Build 이탈, advisor 재검토로 발견) 직접 스트림
 * 필터링이 더 명확하고 신뢰할 수 있다.
 *
 * <p>공허 통과 방지 — 임포트한 {@code JavaClasses} 에 {@code MdmTemporalSegmentStore}({@code lib})와
 * {@code MdmApplication}({@code api} main)이 실제로 들어 있는지 먼저 확인한다(advisor 재검토: 음성
 * 테스트만으로는 "이 임포트가 lib+api 양쪽을 실제로 보고 있다"까지는 증명하지 못한다).
 */
class MdmTemporalSegmentStoreNoImplementationTest {

    private static final JavaClasses MDM = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.dongkuk.dmes.mdm");

    @Test
    void 임포트가_lib_와_api_main_클래스를_모두_포함한다() {
        assertTrue(MDM.contain(MdmTemporalSegmentStore.class),
                "lib 의 MdmTemporalSegmentStore 가 스캔 대상에 없다 — 이 임포트가 lib 를 못 보고 있다");
        assertTrue(MDM.contain(MdmApplication.class),
                "api 의 MdmApplication 이 스캔 대상에 없다 — 이 임포트가 api main 을 못 보고 있다");
    }

    @Test
    void MdmTemporalSegmentStore_의_실_구현체가_com_dongkuk_dmes_mdm_에_없다() {
        Set<JavaClass> implementations = findImplementations(MDM);
        assertTrue(implementations.isEmpty(),
                "com.dongkuk.dmes.mdm.. 안에 MdmTemporalSegmentStore 구현체가 없어야 한다"
                        + "(TSK-07-01 수용 기준 「실행 로직 없음」, TSK-07-03 몫): " + implementations);
    }

    /**
     * 공허 통과 방지 음성 테스트 — 고립된 {@link JavaClasses} 안에 {@code FakeSegmentStoreImpl}(이 테스트
     * 클래스에서만 정의하는 샘플 구현체)을 두고 검사 로직이 실제로 구현체를 잡는지 확인한다.
     */
    @Test
    void 공허_통과_방지_음성_테스트가_실제로_위반을_잡는다() {
        JavaClasses isolated = new ClassFileImporter()
                .importClasses(MdmTemporalSegmentStore.class, FakeSegmentStoreImpl.class);
        Set<JavaClass> implementations = findImplementations(isolated);
        assertTrue(implementations.stream().anyMatch(c -> c.isEquivalentTo(FakeSegmentStoreImpl.class)),
                "고립 클래스(FakeSegmentStoreImpl, MdmTemporalSegmentStore 를 실제로 구현)가 있는데도"
                        + " 검사 로직이 구현체를 잡지 못했다 — 공허 통과하고 있다");
    }

    private static Set<JavaClass> findImplementations(JavaClasses classes) {
        return classes.stream()
                .filter(c -> !c.isInterface())
                .filter(c -> !c.isEquivalentTo(MdmTemporalSegmentStore.class))
                .filter(c -> c.isAssignableTo(MdmTemporalSegmentStore.class))
                .collect(Collectors.toSet());
    }

    /** 음성 테스트 전용 — 이 테스트 클래스 안에서만 쓰는 고립 샘플 구현체. */
    static final class FakeSegmentStoreImpl implements MdmTemporalSegmentStore<String, String> {
        @Override
        public MdmTemporalSegmentResult<String> register(String key, String value, LocalDateTime at) {
            return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.INSERT, value);
        }

        @Override
        public MdmTemporalSegmentResult<String> modify(String key, String value, LocalDateTime at) {
            return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.UPDATE, value);
        }

        @Override
        public MdmTemporalSegmentResult<String> close(String key, LocalDateTime at) {
            return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.CLOSE, null);
        }

        @Override
        public MdmTemporalSegmentResult<String> reopen(String key, LocalDateTime at) {
            return new MdmTemporalSegmentResult<>(MdmTemporalSegmentAction.REOPEN, null);
        }
    }
}
