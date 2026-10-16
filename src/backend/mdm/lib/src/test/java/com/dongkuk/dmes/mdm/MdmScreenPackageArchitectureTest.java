package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * BE 리팩토링 2회차 C5 — 화면 패키지 경계를 고정한다.
 *
 * <ol>
 *   <li>{@code common} 은 화면 그룹({@code dma}·{@code dmb}·{@code dmc}·{@code dmd}·{@code dme})에 기대지 않는다.</li>
 *   <li>화면 패키지({@code <그룹>.<화면>})는 다른 화면 패키지에 기대지 않는다. 같은 그룹의 라이브러리 패키지({@link #LIBRARIES})는 쓸 수
 *       있고, 라이브러리도 화면에 기대지 않는다.</li>
 * </ol>
 *
 * <p>지금 남은 의존은 {@link #EXCEPTIONS} 에 줄마다 항목 ID 와 함께 둔다. 예외가 더는 쓰이지 않으면 시험이 실패하므로 그 줄을 지운다.
 * 예외는 단위 쌍으로 두므로, 예외로 둔 두 단위 사이에 클래스 의존을 더 만들면 이 시험은 잡지 못한다.
 *
 * <p>다른 화면의 {@code static final} 컴파일 상수(문자열·정수)만 읽는 의존은 클래스 파일에 참조가 남지 않아 잡지 못한다
 * ({@code DmeRoleCheckArchitectureTest} 와 같은 한계).
 */
class MdmScreenPackageArchitectureTest {

    private static final String ROOT = "com.dongkuk.dmes.mdm.";
    private static final Set<String> GROUPS = Set.of("dma", "dmb", "dmc", "dmd", "dme");

    /** 그룹 안 여러 화면이 같이 쓰는 라이브러리 패키지 — 같은 그룹의 화면만 쓴다. */
    private static final Set<String> LIBRARIES = Set.of("dma.naming", "dma.support", "dmb.layout");

    /** 허용한 예외 — {@code 원 단위 → 대상 단위}(단위 = {@code common.<하위>} 또는 {@code <그룹>.<화면>}). */
    private static final Set<String> EXCEPTIONS = Set.of(
            // 다음 회차 후보: 공용 layout DTO 분리 — HeaderMngService 가 layoutMng 화면 DTO(LayoutVersionRequest·LayoutVersionResult)를
            // 그대로 쓴다. BPMN dto FQCN 계약이 걸려 이번 범위(C5 layout 코어) 밖이다(조정자 결정 2026-10-16).
            "dmb.headerMng -> dmb.layoutMng",
            // C5 — LayoutConstJudge 가 DomainTestCaseRunner.preview 를 쓴다. preview 계열 common 추출 후보(조정자 결정 2026-10-16).
            "dmb.layout -> dma.domainMng",
            // C7 뒤 후보 — dataHistory 가 dataItemMng 의 목록 조회·행 모델을 쓴다.
            "dmd.dataHistory -> dmd.dataItemMng");

    private static JavaClasses classes;

    @BeforeAll
    static void importClasses() {
        classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.dongkuk.dmes.mdm");
        assertTrue(classes.stream().anyMatch(c -> c.getName().equals(ROOT + "dme.ruleEdit.service.RuleEditService")),
                "mdm 클래스가 가져와지지 않았다");
    }

    @Test
    void common_과_화면_패키지는_예외_목록_밖의_다른_화면에_기대지_않는다() {
        List<String> violations = new ArrayList<>();
        for (Dependency d : crossDependencies()) {
            String edge = unit(d.getOriginClass()) + " -> " + unit(d.getTargetClass());
            if (!EXCEPTIONS.contains(edge)) {
                violations.add(edge + " : " + d.getDescription());
            }
        }
        assertEquals(List.of(), violations, "화면 패키지 경계 위반(C5)");
    }

    @Test
    void 예외_목록은_지금_남은_의존만_담는다() {
        Set<String> used = new TreeSet<>();
        for (Dependency d : crossDependencies()) {
            used.add(unit(d.getOriginClass()) + " -> " + unit(d.getTargetClass()));
        }
        Set<String> stale = new TreeSet<>(EXCEPTIONS);
        stale.removeAll(used);
        assertEquals(Set.of(), stale, "더는 쓰이지 않는 예외 — 목록에서 지운다");
    }

    /** 경계를 넘는 의존 — 원이 common 또는 화면 그룹이고, 대상이 다른 단위의 화면(또는 다른 그룹의 라이브러리)이다. */
    private static Set<Dependency> crossDependencies() {
        Set<Dependency> out = new LinkedHashSet<>();
        for (JavaClass c : classes) {
            String from = unit(c);
            if (from == null) {
                continue;
            }
            for (Dependency d : c.getDirectDependenciesFromSelf()) {
                String to = unit(d.getTargetClass());
                if (to == null || to.equals(from) || to.startsWith("common.") || !GROUPS.contains(group(to))) {
                    continue;
                }
                if (LIBRARIES.contains(to) && group(to).equals(group(from))) {
                    continue;
                }
                out.add(d);
            }
        }
        return out;
    }

    /** {@code common.<하위>} 또는 {@code <그룹>.<화면>}. 그 밖(entity·repository·contract·batch·feed·job 등)은 null. */
    private static String unit(JavaClass c) {
        String pkg = c.getPackageName();
        if (!pkg.startsWith(ROOT)) {
            return null;
        }
        String[] parts = pkg.substring(ROOT.length()).split("\\.");
        if (parts.length < 2 || !(parts[0].equals("common") || GROUPS.contains(parts[0]))) {
            return null;
        }
        return parts[0] + "." + parts[1];
    }

    private static String group(String unit) {
        return unit.substring(0, unit.indexOf('.'));
    }
}
