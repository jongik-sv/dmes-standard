package kr.dongkuk.maru.mdm.engine.testsupport;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.code.CodeRowsProjection;
import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 판정 동치(D-154, 스펙 §6.1) — 기준은 투영된 전 이력의 {@code new DefaultCodeResolver(id -> projected, NONE)}. 새 경로 두 벌(색인 있음·NONE)이
 * {@code CodeResolver} 다섯 메서드 전부에서 기준과 같아야 한다.
 */
public final class CodeEquivalence {

    private static final LocalDateTime OPEN_DT = LocalDateTime.parse("9999-12-31T00:00:00");

    private CodeEquivalence() {}

    /** @return 비교한 (시각, 카테고리, 코드) 조합 수 — 빈 시험을 막으려고 호출자가 하한을 단언한다 */
    public static int assertEquivalent(CodeRows full, List<LocalDateTime> times, List<String> cates, List<String> codes, int[] attrNos) {
        CodeRows projected = CodeRowsProjection.releasedOnly(full);
        String id = projected.header().maruCodeId();
        DefaultCodeResolver reference = new DefaultCodeResolver(InMemoryLookups.codeLookup(projected), CodeEffLookup.NONE);
        int checks = 0;
        for (boolean withEff : new boolean[] {true, false}) {
            DefaultCodeResolver sliced = SlicedCodeLookups.resolver(full, withEff);
            String mode = withEff ? "[색인] " : "[NONE] ";
            for (LocalDateTime t : times) {
                assertEquals(reference.selectVersion(id, t), sliced.selectVersion(id, t), mode + "selectVersion " + t);
                for (String cate : cates) {
                    assertEquals(reference.codeList(id, cate, t), sliced.codeList(id, cate, t), mode + "codeList " + cate + " " + t);
                    for (String code : codes) {
                        String at = mode + cate + "/" + code + " " + t;
                        assertEquals(reference.isMember(id, cate, code, t), sliced.isMember(id, cate, code, t), "isMember " + at);
                        for (int n : attrNos) {
                            assertEquals(reference.attr(id, cate, code, t, n), sliced.attr(id, cate, code, t, n), "attr" + n + " " + at);
                        }
                        checks++;
                    }
                }
            }
            for (CodeVersionRow v : projected.versions()) {
                for (String cate : cates) {
                    assertEquals(reference.effectiveCodes(id, v.ver(), cate), sliced.effectiveCodes(id, v.ver(), cate),
                            mode + "effectiveCodes " + v.ver() + " " + cate);
                }
            }
        }
        return checks;
    }

    /** RELEASED 버전마다 applyFrom·applyTo 의 ±1초(열린 끝 제외), 첫 버전 하루 전, 열린 끝 직전. */
    public static List<LocalDateTime> boundaryTimes(CodeRows full) {
        Set<LocalDateTime> out = new LinkedHashSet<>();
        LocalDateTime first = null;
        for (CodeVersionRow v : CodeRowsProjection.releasedOnly(full).versions()) {
            for (LocalDateTime b : new LocalDateTime[] {v.applyFrom(), v.applyTo()}) {
                if (b != null && !b.equals(OPEN_DT)) {
                    out.add(b.minusSeconds(1));
                    out.add(b);
                    out.add(b.plusSeconds(1));
                }
            }
            if (v.applyFrom() != null && (first == null || v.applyFrom().isBefore(first))) {
                first = v.applyFrom();
            }
        }
        if (first != null) {
            out.add(first.minusDays(1));
        }
        out.add(OPEN_DT.minusSeconds(1));
        return new ArrayList<>(out);
    }

    /** 투영에 남은 cateId 전부 + BASE + 없는 cateId + null + 빈 문자열. */
    public static List<String> cates(CodeRows full) {
        Set<String> out = new LinkedHashSet<>();
        CodeRowsProjection.releasedOnly(full).categories().stream().map(CodeCateRow::cateId).forEach(out::add);
        out.add("BASE");
        out.add("NO_SUCH_CATE");
        List<String> list = new ArrayList<>(out);
        list.addAll(Arrays.asList(null, ""));
        return list;
    }

    /** 투영 items 의 코드 전부 + 없는 코드 + null. */
    public static List<String> codes(CodeRows full) {
        Set<String> out = new LinkedHashSet<>();
        CodeRowsProjection.releasedOnly(full).items().stream().map(CodeItemRow::code).forEach(out::add);
        out.add("NO_SUCH_CODE");
        List<String> list = new ArrayList<>(out);
        list.add(null);
        return list;
    }

    public static int[] allAttrs() {
        return new int[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    }

    /** RELEASED 버전 ver 목록. */
    public static List<BigDecimal> releasedVers(CodeRows full) {
        return CodeRowsProjection.releasedOnly(full).versions().stream().map(CodeVersionRow::ver).toList();
    }
}
