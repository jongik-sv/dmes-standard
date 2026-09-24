package com.dongkuk.dmes.mdm.contract.mastercode;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.category.CategoryConventions;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.category.MaruIdKind;
import com.dongkuk.dmes.mdm.contract.category.MaruIdNamespace;
import com.dongkuk.dmes.mdm.contract.category.MaruIdRules;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.MaruObjectStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import jakarta.persistence.Column;
import jakarta.persistence.Table;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * TSK-06-01 design.md §3.5 — 04 마스터코드 계약({@code contract.mastercode})의 값·경계를 고정한다. 모양 규칙(인터페이스는
 * 추상 메서드만, record·enum 은 접근자만, Spring·JPA 무의존)은 {@code MdmContractArchitectureTest} 가 수정 없이 자동 적용한다.
 */
class MasterCodeContractTest {

    private static final String PACKAGE = "com.dongkuk.dmes.mdm.contract.mastercode";

    private static final JavaClasses CONTRACT = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages(PACKAGE);

    // ── 1: 확정 검사 8항 표(04:405-416, PRD FR-C5) ──

    @Test
    void 확정_검사_8항은_10행이고_번호_심각도_면제_위임_보류가_원천과_같다() {
        MasterCodeConfirmCheckItem[] items = MasterCodeConfirmCheckItem.values();
        assertEquals(List.of("1", "2", "2-1", "2-2", "3", "4", "5", "6", "7", "8"),
                Arrays.stream(items).map(MasterCodeConfirmCheckItem::no).toList());
        assertEquals(Set.of("2-1", "2-2", "5"), noWhere(i -> i.severity() == MasterCodeCheckSeverity.WARNING),
                "경고는 2-1·2-2·5, 나머지는 거부");
        assertEquals(Set.of("1", "2", "3", "4", "6", "7", "8"), noWhere(i -> i.severity() == MasterCodeCheckSeverity.REJECT));
        assertEquals(Set.of("3", "4"), noWhere(MasterCodeConfirmCheckItem::firstVersionExempt), "최초 버전 면제(04:411-412)");
        assertEquals(Set.of("3"), noWhere(MasterCodeConfirmCheckItem::sharedCheck), "3항은 공통 서비스가 검사(F18)");
        assertEquals(Set.of("5"), noWhere(i -> !i.inScope()), "5항(배포 대상)은 보류(D9)");
    }

    // ── 2: 선분 상수 ──

    @Test
    void 선분_상수가_원천과_같다() {
        assertEquals(0, MasterCodeConventions.OPEN_TO_VER.compareTo(new BigDecimal("9999")));
        assertEquals(VersionTarget.MASTER_CODE.versionScale(), MasterCodeConventions.OPEN_TO_VER.scale());
        assertEquals(new BigDecimal("1.000"), MasterCodeConventions.FIRST_VER);
        assertEquals(999, MasterCodeConventions.MAX_MINOR);
        assertEquals(9998, MasterCodeConventions.MAX_MAJOR, "9999 는 발급하지 않는다(04:278)");
        assertEquals(0, MasterCodeConventions.LVL_CNT_MIN);
        assertEquals(5, MasterCodeConventions.LVL_CNT_MAX);
        assertEquals(0, MasterCodeConventions.LVL_CNT_DEFAULT);
        assertEquals(5, MasterCodeConventions.LVL_SLOTS);
        assertEquals(10, MasterCodeConventions.ATTR_SLOTS);
    }

    // ── 3·4: diff 키 규약(D10)·표 이름 ──

    @Test
    void diff_키_구분자는_cate_id_와_code_의_금지_문자다() {
        String part = MasterCodeDiffConventions.KEY_PART_SEPARATOR;
        assertTrue(Pattern.matches(MaruIdRules.FORBIDDEN_CHAR_PATTERN, part), "cate_id 에 나올 수 없어야 한다");
        assertTrue(Pattern.matches(MasterCodeConventions.CODE_FORBIDDEN_CHAR_PATTERN, part), "code 에 나올 수 없어야 한다");
        for (MasterCodeSegmentTable table : MasterCodeSegmentTable.values()) {
            assertFalse(table.name().contains(MasterCodeDiffConventions.TABLE_KEY_SEPARATOR), table.name());
        }
        assertTrue(Pattern.matches(MasterCodeConventions.CODE_FORBIDDEN_CHAR_PATTERN, " "), "공백도 code 금지 문자(04:197)");
    }

    @Test
    void 선분_표는_ITEM_CATE_CATE_ITEM_세_개다() {
        assertEquals(List.of("TB_MDM_CODE_ITEM", "TB_MDM_CODE_CATE", "TB_MDM_CODE_CATE_ITEM"),
                Arrays.stream(MasterCodeSegmentTable.values()).map(MasterCodeSegmentTable::physicalTable).toList());
    }

    // ── 5: 전사 계약 재정의·복제 금지(불변 규칙 25) ──

    @Test
    void 전사_enum_과_같은_상수_집합의_enum_을_다시_만들지_않는다() {
        List<Set<String>> shared = List.of(names(CategoryKind.class), names(CategoryDefTarget.class), names(MaruIdKind.class),
                names(VersionStatus.class), names(MaruObjectStatus.class), names(DiffKind.class));
        int enums = 0;
        for (JavaClass type : CONTRACT) {
            if (type.isEnum()) {
                enums++;
                @SuppressWarnings({"unchecked", "rawtypes"})
                Set<String> constants = names((Class) type.reflect());
                assertFalse(shared.contains(constants), type.getName() + " 이 전사 enum 을 복제했다: " + constants);
            }
        }
        assertTrue(enums >= 6, "계약 enum 을 가져오지 못했다 — 규칙이 공허하게 통과한다");
    }

    @Test
    void BASE_와_전체_일치식_ID_금지_문자_상수를_다시_두지_않는다() throws IllegalAccessException {
        Set<String> forbidden = Set.of(CategoryConventions.BASE_CATE_ID, CategoryConventions.BASE_DEF_EXPR,
                MaruIdRules.FORBIDDEN_CHAR_PATTERN);
        int stringConstants = 0;
        for (JavaClass type : CONTRACT) {
            for (Field field : type.reflect().getDeclaredFields()) {
                int mod = field.getModifiers();
                if (Modifier.isStatic(mod) && Modifier.isFinal(mod) && field.getType() == String.class) {
                    stringConstants++;
                    field.setAccessible(true);
                    Object value = field.get(null);
                    assertFalse(forbidden.contains(value), type.getName() + "." + field.getName() + " = " + value);
                }
            }
        }
        assertTrue(stringConstants >= 3, "문자열 상수를 가져오지 못했다 — 규칙이 공허하게 통과한다");
    }

    @Test
    void 전사_SPI_의_메서드를_새로_선언하지_않고_상속한다() {
        Set<String> shared = new HashSet<>();
        for (Class<?> spi : List.of(MaruIdNamespace.class, VersionConfirmCheckSpi.class, VersionDraftDeletionSpi.class)) {
            Arrays.stream(spi.getDeclaredMethods()).map(MasterCodeContractTest::signature).forEach(shared::add);
        }
        for (JavaClass type : CONTRACT) {
            if (type.isInterface()) {
                for (Method method : type.reflect().getDeclaredMethods()) {
                    assertFalse(shared.contains(signature(method)), type.getName() + " 이 전사 SPI 메서드를 다시 선언했다: " + method);
                }
            }
        }
        assertTrue(VersionConfirmCheckSpi.class.isAssignableFrom(MasterCodeConfirmCheckSpi.class),
                "MasterCodeConfirmCheckSpi 는 VersionConfirmCheckSpi 를 상속한다(target 당 구현 하나, 불변 규칙 29)");
    }

    @Test
    void 카테고리_추가는_전사_CategoryDefinition_을_그대로_받는다() throws NoSuchMethodException {
        Method addCategory = MasterCodeSegmentService.class.getMethod("addCategory",
                com.dongkuk.dmes.mdm.contract.version.VersionRef.class, CategoryDefinition.class);
        assertTrue(List.of(addCategory.getParameterTypes()).contains(CategoryDefinition.class));
        assertEquals(CategoryDefinition.class, MasterCodeCateRow.class.getRecordComponents()[0].getType());
    }

    // ── 6: 선분 조작 서비스 경계(D8, 불변 규칙 26) ──

    @Test
    void 선분_조작_서비스의_메서드_집합이_설계_목록과_정확히_같다() {
        Set<String> declared = Arrays.stream(MasterCodeSegmentService.class.getDeclaredMethods())
                .map(m -> m.getName() + "(" + Arrays.stream(m.getParameterTypes()).map(Class::getSimpleName)
                        .collect(Collectors.joining(",")) + ")" + m.getReturnType().getSimpleName())
                .collect(Collectors.toCollection(TreeSet::new));
        Set<String> expected = new TreeSet<>(Set.of(
                "viewAt(VersionRef)MasterCodeVersionView",
                "createBaseCategory(VersionRef)void",
                "addItem(VersionRef,String,MasterCodeItemValues)void",
                "changeItem(VersionRef,String,MasterCodeItemValues)void",
                "removeItem(VersionRef,String)List",
                "addCategory(VersionRef,CategoryDefinition)void",
                "changeCategory(VersionRef,CategoryDefinition)void",
                "closeCategory(VersionRef,String)void",
                "addCategoryMembers(VersionRef,String,Set)void",
                "removeCategoryMembers(VersionRef,String,Set)void",
                "revert(VersionRef,MasterCodeSegmentKey)void",
                "fillFrom(VersionRef,BigDecimal)void"));
        assertEquals(expected, declared, "ROW_VERSION·사용자 인자 추가, DRAFT 삭제 재선언, 메서드 누락을 모두 잡는다");
    }

    // ── 7: 엔티티 범위(D2, 불변 규칙 14·15) ──

    @Test
    void 보류_표_엔티티가_없고_MdmCode_는_LAST_CHG_SEQ_를_매핑하지_않는다() throws ClassNotFoundException {
        JavaClasses entities = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.dongkuk.dmes.mdm.entity");
        Set<String> tables = new TreeSet<>();
        for (JavaClass type : entities) {
            Table table = type.reflect().getAnnotation(Table.class);
            if (table != null) {
                tables.add(table.name());
            }
        }
        assertTrue(tables.containsAll(Set.of("TB_MDM_CODE", "TB_MDM_CODE_VER", "TB_MDM_CODE_ITEM", "TB_MDM_CODE_CATE",
                "TB_MDM_CODE_CATE_ITEM")), "업무 활성 5표 엔티티: " + tables);
        assertFalse(tables.contains("TB_MDM_CODE_SYSTEM"), "보류 표 TB_MDM_CODE_SYSTEM 엔티티를 만들지 않는다(D2)");
        assertFalse(tables.contains("TB_MDM_CODE_RECV"), "보류 표 TB_MDM_CODE_RECV 엔티티를 만들지 않는다(D2)");

        for (Field field : Class.forName("com.dongkuk.dmes.mdm.entity.MdmCode").getDeclaredFields()) {
            Column column = field.getAnnotation(Column.class);
            assertFalse(column != null && column.name().equals("LAST_CHG_SEQ"),
                    "MdmCode 는 LAST_CHG_SEQ 를 매핑하지 않는다(D2, D-019): " + field.getName());
        }
    }

    // ── 도우미 ──

    private static Set<String> noWhere(java.util.function.Predicate<MasterCodeConfirmCheckItem> filter) {
        return Arrays.stream(MasterCodeConfirmCheckItem.values()).filter(filter)
                .map(MasterCodeConfirmCheckItem::no).collect(Collectors.toSet());
    }

    private static <E extends Enum<E>> Set<String> names(Class<E> type) {
        return EnumSet.allOf(type).stream().map(Enum::name).collect(Collectors.toSet());
    }

    private static String signature(Method method) {
        return method.getName() + Arrays.toString(method.getParameterTypes());
    }
}
