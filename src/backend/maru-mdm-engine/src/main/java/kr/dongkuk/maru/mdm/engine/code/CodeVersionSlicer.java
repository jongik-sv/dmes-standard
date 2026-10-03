package kr.dongkuk.maru.mdm.engine.code;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 투영된 전 이력에서 버전 본문 하나를 자른다(D-154, 스펙 §4.2-3). MDM 피드 본문 생성과 업무 모듈 물러남(옛 MDM 응답, 스펙 §5.8)이 이 함수 하나를
 * 쓰고, 동치 시험의 기준도 여기 있다. 소속은 {@link DefaultCodeResolver#effectiveCodes} 로 계산한다 — 판정 규칙을 두 벌로 만들지 않는다.
 */
public final class CodeVersionSlicer {

    private static final String RELEASED = "RELEASED";

    private CodeVersionSlicer() {}

    /**
     * @param projected {@link CodeRowsProjection#releasedOnly} 결과
     * @param ver       {@code projected} 안의 RELEASED 버전(수 비교). 아니면 {@link IllegalArgumentException}
     */
    public static CodeVersionSlice slice(CodeRows projected, BigDecimal ver) {
        CodeVersionRow version = projected.versions().stream()
                .filter(v -> RELEASED.equals(v.status()) && v.ver().compareTo(ver) == 0)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "RELEASED 버전이 아니다: " + projected.header().maruCodeId() + " " + ver));
        BigDecimal v = version.ver();
        String id = projected.header().maruCodeId();
        List<CodeItemRow> items = DefaultCodeResolver.validItems(projected, v);
        Set<String> itemCodes = new LinkedHashSet<>();
        items.forEach(i -> itemCodes.add(i.code()));
        DefaultCodeResolver resolver = new DefaultCodeResolver(maruCodeId -> Optional.of(projected), CodeEffLookup.NONE);
        Map<String, List<CodeCateRow>> byCate = new LinkedHashMap<>();
        projected.categories().forEach(c -> byCate.computeIfAbsent(c.cateId(), k -> new ArrayList<>()).add(c));
        List<CodeVersionSlice.SlicedCategory> categories = new ArrayList<>();
        byCate.forEach((cateId, defs) -> Segments.coveringOrEarliest(defs, CodeCateRow::fromVer, CodeCateRow::toVer, v).ifPresent(def -> {
            Set<String> members = resolver.effectiveCodes(id, v, cateId);
            boolean all = !itemCodes.isEmpty() && members.equals(itemCodes);
            categories.add(new CodeVersionSlice.SlicedCategory(def.cateId(), def.fromVer(), def.toVer(), def.defKind(), def.defExpr(),
                    def.defTarget(), all, all ? null : List.copyOf(members)));
        }));
        return new CodeVersionSlice(id, v, items, categories);
    }
}
