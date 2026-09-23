package kr.dongkuk.maru.mdm.engine.arch;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaConstructor;
import com.tngtech.archunit.core.domain.JavaConstructorCall;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * TSK-03-01 design.md §3.1·§5 I4-I7 — 계약 타입의 형태 규칙. 영구 규칙이다.
 *
 * <p>{@link #CONTRACT_TYPES} 에 든 클래스에만 적용한다. 그래서 후속 Task(TSK-03-02·03)가 구현 클래스를 더해도
 * 깨지지 않고, 계약 타입에 로직을 넣을 때만 깨진다. 목록의 이름이 main 에 없으면 {@code ENGINE.get} 이 실패한다.
 *
 * <p>허용 예외(design §6.1): {@code EngineEvaluationException} 생성자 로직, {@code RuleEngine.text}·{@code textAndAst}
 * default 위임. {@code MasterLookup$1}(NONE 익명 클래스)은 계약 타입이 아니라 {@code ContractOnlyPhaseTest} 가 허용한다.
 */
class ContractTypeShapeTest {

    static final String PREFIX = "kr.dongkuk.maru.mdm.engine.";

    /** design §6.1 — 이름 있는 계약 클래스 전부(중첩 포함). {@code ContractOnlyPhaseTest} 가 같은 목록을 쓴다. */
    static final Set<String> CONTRACT_TYPES = Stream.of(
                    // spi
                    "spi.DefinitionLookup", "spi.DefinitionLookup$ColumnDefinition", "spi.DefinitionLookup$CodeRef",
                    "spi.DefinitionLookup$DomainKind", "spi.DefinitionLookup$DataType", "spi.DefinitionLookup$RuleDefinition",
                    "spi.DefinitionLookup$RuleKind", "spi.DefinitionLookup$HitPolicy", "spi.DefinitionLookup$VarKind",
                    "spi.DefinitionLookup$DispType", "spi.DefinitionLookup$CollectAgg", "spi.DefinitionLookup$RuleVar",
                    "spi.DefinitionLookup$RowKind", "spi.DefinitionLookup$RuleRow", "spi.DefinitionLookup$RuleCell",
                    "spi.DefinitionLookup$InputContract", "spi.DefinitionLookup$RowContract", "spi.DefinitionLookup$VarType",
                    "spi.DefinitionLookup$RuleSetDefinition", "spi.DefinitionLookup$SetStatus",
                    "spi.CodeLookup", "spi.CodeLookup$CodeRows", "spi.CodeLookup$CodeHeader", "spi.CodeLookup$CodeVersionRow",
                    "spi.CodeLookup$CodeItemRow", "spi.CodeLookup$CodeCateRow", "spi.CodeLookup$CodeCateItemRow",
                    "spi.CodeEffLookup",
                    "spi.MasterLookup",
                    "spi.FunctionProvider", "spi.FunctionProvider$BusinessFunction", "spi.FunctionProvider$Param",
                    "spi.FunctionProvider$Body",
                    "spi.EngineLookups",
                    "spi.Nullable",
                    // expr
                    "expr.AstNode", "expr.AstNode$Type",
                    "expr.EngineWarning", "expr.EngineWarning$Code",
                    "expr.EngineEvaluationException", "expr.EngineEvaluationException$Stage",
                    "expr.EngineEvaluationException$Code", "expr.EngineEvaluationException$Violation",
                    "expr.FunctionSets", "expr.FunctionSets$Slot",
                    "expr.ReservedNames",
                    "expr.MdmExpressionConfig",
                    "expr.MdmFunction",
                    // code
                    "code.CodeResolver", "code.CodeResolver$CodeListEntry",
                    // rule
                    "rule.RuleEngine", "rule.RuleEngine$Part",
                    "rule.RuleResult", "rule.RuleResult$Hit", "rule.RuleResult$RowTrace",
                    "rule.RuleSetResult",
                    "rule.RuleView", "rule.RuleView$ColumnView", "rule.RuleView$RowView", "rule.RuleView$CellView",
                    // domain
                    "domain.DomainValidator", "domain.DomainValidator$ValidationResult", "domain.DomainValidator$Failure",
                    "domain.DomainValidator$Step")
            .map(name -> PREFIX + name)
            .collect(Collectors.toUnmodifiableSet());

    /** 값만 싣는 상수 홀더 — final 클래스, private 생성자, static final 필드. */
    static final Set<String> CONSTANT_HOLDERS = Set.of(
            PREFIX + "expr.FunctionSets", PREFIX + "expr.ReservedNames", PREFIX + "expr.MdmExpressionConfig");

    /** 예외 타입은 class 여야 한다. 생성자의 위반 목록 복사는 값 운반이다(design §6.1 허용 예외). */
    static final String EXCEPTION_TYPE = PREFIX + "expr.EngineEvaluationException";

    /** 원천 06:480 이 정한 default 위임 두 개(design §6.1 허용 예외). */
    private static final Set<String> INTERFACE_BODY_ALLOWED = Set.of(
            PREFIX + "rule.RuleEngine.text", PREFIX + "rule.RuleEngine.textAndAst");

    private static final Set<String> RECORD_OBJECT_METHODS = Set.of("equals", "hashCode", "toString");

    static final JavaClasses ENGINE = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("kr.dongkuk.maru.mdm.engine");

    static List<JavaClass> contractClasses() {
        return CONTRACT_TYPES.stream().sorted().map(ENGINE::get).toList();
    }

    @Test
    void 계약_타입은_interface_record_enum_annotation_상수홀더_예외뿐이다() {
        List<String> violations = new ArrayList<>();
        for (JavaClass c : contractClasses()) {
            boolean allowed = c.isInterface() || c.isAnnotation() || c.isRecord() || c.isEnum()
                    || CONSTANT_HOLDERS.contains(c.getName()) || EXCEPTION_TYPE.equals(c.getName());
            if (!allowed) {
                violations.add(c.getName());
            }
        }
        assertEquals(List.of(), violations, "계약 타입은 interface·record·enum·annotation·상수 홀더·예외 타입뿐이어야 한다");
    }

    @Test
    void 상수_홀더는_final_이고_생성자가_private_이며_필드가_static_final_이다() {
        List<String> violations = new ArrayList<>();
        for (String name : new TreeSet<>(CONSTANT_HOLDERS)) {
            JavaClass c = ENGINE.get(name);
            if (!c.getModifiers().contains(JavaModifier.FINAL)) {
                violations.add(name + " 가 final 이 아니다");
            }
            for (JavaConstructor ctor : c.getConstructors()) {
                if (!ctor.getModifiers().contains(JavaModifier.PRIVATE)) {
                    violations.add(ctor.getFullName() + " 가 private 이 아니다");
                }
            }
            for (JavaField field : c.getFields()) {
                if (!field.getModifiers().containsAll(Set.of(JavaModifier.STATIC, JavaModifier.FINAL))) {
                    violations.add(field.getFullName() + " 가 static final 이 아니다");
                }
            }
        }
        assertEquals(List.of(), violations);
    }

    @Test
    void 계약_record_는_접근자와_equals_hashCode_toString_외_메서드가_없다() {
        List<String> violations = new ArrayList<>();
        for (JavaClass c : contractClasses()) {
            if (!c.isRecord()) {
                continue;
            }
            Set<String> allowed = new TreeSet<>(RECORD_OBJECT_METHODS);
            Arrays.stream(c.reflect().getRecordComponents()).map(RecordComponent::getName).forEach(allowed::add);
            for (JavaMethod m : c.getMethods()) {
                if (!m.getModifiers().contains(JavaModifier.SYNTHETIC) && !allowed.contains(m.getName())) {
                    violations.add(m.getFullName());
                }
            }
        }
        assertEquals(List.of(), violations, "계약 record 에 접근자·equals·hashCode·toString 외 메서드가 있다");
    }

    @Test
    void 계약_record_생성자는_Record_생성자만_부른다() {
        List<String> violations = new ArrayList<>();
        for (JavaClass c : contractClasses()) {
            if (!c.isRecord()) {
                continue;
            }
            for (JavaConstructor ctor : c.getConstructors()) {
                if (!ctor.getMethodCallsFromSelf().isEmpty()) {
                    violations.add(ctor.getFullName() + " 가 메서드를 부른다: " + ctor.getMethodCallsFromSelf());
                }
                for (JavaConstructorCall call : ctor.getConstructorCallsFromSelf()) {
                    if (!call.getTarget().getOwner().getName().equals(Record.class.getName())) {
                        violations.add(ctor.getFullName() + " 가 " + call.getTarget().getFullName() + " 를 부른다");
                    }
                }
            }
        }
        assertEquals(List.of(), violations, "계약 record 생성자에 로직이 있다(compact 생성자 금지)");
    }

    @Test
    void 계약_interface_의_몸체_있는_메서드는_RuleEngine_text_textAndAst_뿐이다() {
        Set<String> withBody = new TreeSet<>();
        for (JavaClass c : contractClasses()) {
            if (!c.isInterface()) {
                continue;
            }
            for (JavaCodeUnit m : c.getMethods()) {
                Set<JavaModifier> mods = m.getModifiers();
                if (!mods.contains(JavaModifier.ABSTRACT) && !mods.contains(JavaModifier.SYNTHETIC)) {
                    withBody.add(c.getName() + "." + m.getName());
                }
            }
        }
        assertTrue(withBody.equals(INTERFACE_BODY_ALLOWED),
                "몸체 있는 interface 메서드 = " + withBody + ", 허용 = " + INTERFACE_BODY_ALLOWED);
    }
}
