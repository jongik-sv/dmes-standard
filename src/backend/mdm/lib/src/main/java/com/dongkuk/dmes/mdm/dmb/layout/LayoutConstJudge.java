package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import com.dongkuk.dmes.mdm.dma.domainMng.service.DomainTestCaseRunner;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.BiFunction;
import kr.dongkuk.maru.mdm.engine.expr.ValueConversionException;
import kr.dongkuk.maru.mdm.engine.expr.ValueConverter;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import org.springframework.stereotype.Component;

/**
 * CONST 값 하나를 도메인 유효 식으로 판정한다(TSK-05-03 design.md §2 — 03 거부 #2, 불변 I14, D6). 도메인 화면과 같은 판정을 쓴다 —
 * ① 엔진 {@link ValueConverter} 타입 변환 ② 표준식이 있으면 {@link DomainTestCaseRunner#preview} 의 {@code std.RESULT}. 비즈니스식은
 * 레코드 변수가 필요해 보지 않는다. 서버에 코드 원장이 없어 판정할 수 없으면(CODE·MASTER) UNDECIDED — 호출자가 경고로 둔다.
 * 바이트 길이 검사는 호출자({@link LayoutRegistrationRules})가 한다.
 */
@Component
public class LayoutConstJudge {

    private final LayoutDictionary dictionary;
    private final DomainTestCaseRunner runner;

    public LayoutConstJudge(LayoutDictionary dictionary, DomainTestCaseRunner runner) {
        this.dictionary = dictionary;
        this.runner = runner;
    }

    /** @param result {@link #PASS}·{@link #FAIL}·{@link #UNDECIDED} */
    public record Judgement(String result, String message) {
        public static final String PASS = "PASS";
        public static final String FAIL = "FAIL";
        public static final String UNDECIDED = "UNDECIDED";
    }

    /** 이 물리명들의 도메인을 한 번 조립해 두고 판정하는 함수. 사전에 없는 물리명은 PASS(L01·L07 이 따로 잡는다). */
    public BiFunction<String, String, Judgement> forColumns(Collection<String> physNames) {
        Map<String, EffectiveDomainView> views = dictionary.views(physNames);
        return (phys, value) -> judge(views.get(phys), phys, value);
    }

    public Judgement judge(String columnPhys, String value) {
        return forColumns(List.of(columnPhys)).apply(columnPhys, value);
    }

    private Judgement judge(EffectiveDomainView view, String phys, String value) {
        if (view == null || value == null) {
            return new Judgement(Judgement.PASS, null);
        }
        DataType type = dataType(view.dataType());
        if (type != null) {
            try {
                ValueConverter.convert(value, type);
            } catch (ValueConversionException e) {
                return new Judgement(Judgement.FAIL, "타입 변환: " + e.getMessage());
            }
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> std = (Map<String, Object>) runner.preview(view, phys, value, Map.of()).get("std");
        if (std == null) {
            return new Judgement(Judgement.PASS, null);
        }
        String result = String.valueOf(std.get("RESULT"));
        String message = std.get("MESSAGE") == null ? null : String.valueOf(std.get("MESSAGE"));
        return switch (result) {
            case "false", "ERROR" -> new Judgement(Judgement.FAIL, message == null ? "표준식 위반" : message);
            case "UNDECIDED" -> new Judgement(Judgement.UNDECIDED, message);
            default -> new Judgement(Judgement.PASS, null);
        };
    }

    private static DataType dataType(String t) {
        try {
            return t == null ? null : DataType.valueOf(t.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
