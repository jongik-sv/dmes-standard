package kr.dongkuk.maru.mdm.engine.code;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NavigableSet;
import java.util.TreeSet;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 마루 코드 행의 RELEASED 투영(D-152). 판정({@link DefaultCodeResolver})은 RELEASED 버전만 고르므로({@code CodeVersionRow} 계약 — "사본은
 * RELEASED 만 실어도 된다"), 업무 모듈에 보내는 사본에서 RELEASED 가 아닌 버전(DRAFT·REQUESTED·APPROVED·CANCELLED)과 그 버전에서만 유효한 행을 덜어 낸다. 판정 의미를 엔진 한
 * 곳에 두려고 여기 둔다.
 *
 * <ul>
 *   <li>versions — status RELEASED 만.</li>
 *   <li>items·categories — 어떤 RELEASED 버전 V 에서 {@code fromVer <= V < toVer} 인 행만. 그러면 카테고리 최초 소급은 남은 정의
 *       가운데 가장 이른 것으로 간다 — 초안·취소 버전에만 있는 정의는 더는 RELEASED 판정에 소급되지 않는다.</li>
 *   <li>cateItems — 어떤 RELEASED 버전에서 유효하거나, 같은 카테고리의 남은 TABLE 정의 fromVer 에서 유효한 행만. TABLE 소속은
 *       {@code effVer = max(정의 fromVer, V)} 로 읽으므로 소급 경로가 쓰는 행을 잃지 않으려는 것이다.</li>
 *   <li>header — 그대로. RELEASED 가 없으면 나머지 넷은 빈 목록이다.</li>
 * </ul>
 *
 * <p>버전은 {@link BigDecimal#compareTo} 로 비교한다(자리수 무시, 열린 끝 9999 도 일반 값). 목록 순서는 입력 그대로다. 행마다 정렬한
 * RELEASED 버전에서 {@code ceiling(fromVer)} 를 찾아 {@code < toVer} 인지 본다 — O((V + I)·log V).
 *
 * <p>카테고리마다 가장 이른 정의가 어떤 RELEASED 버전에서 유효하면 투영 전후의 RELEASED 판정(버전 선택·CODE_LIST·MASTER·attr, 그리고
 * RELEASED 버전을 인자로 준 {@code effectiveCodes})이 같다. 아니면 바뀔 수 있다(다른 남은 정의가 모든 RELEASED 버전을 덮으면 같다).
 * 취소 버전은 없던 것으로 본다(사용자 결정) — 확정 취소 → 복원 → 재추가 뒤에는 취소 버전에서만 유효하던 정의가 남아 있을 수 있고, 투영 뒤
 * 결과는 그 행을 지운 원장과 같다.
 */
public final class CodeRowsProjection {

    private static final String RELEASED = "RELEASED";
    private static final String TABLE = "TABLE";

    private CodeRowsProjection() {}

    public static CodeRows releasedOnly(CodeRows rows) {
        List<CodeVersionRow> versions = rows.versions().stream().filter(v -> RELEASED.equals(v.status())).toList();
        NavigableSet<BigDecimal> released = new TreeSet<>();
        versions.forEach(v -> released.add(v.ver()));
        if (released.isEmpty()) {
            return new CodeRows(rows.header(), List.of(), List.of(), List.of(), List.of());
        }
        List<CodeItemRow> items = keep(rows.items(), released, CodeItemRow::fromVer, CodeItemRow::toVer);
        List<CodeCateRow> categories = keep(rows.categories(), released, CodeCateRow::fromVer, CodeCateRow::toVer);
        Map<String, NavigableSet<BigDecimal>> tableFroms = new HashMap<>();
        categories.stream()
                .filter(c -> TABLE.equals(c.defKind()))
                .forEach(c -> tableFroms.computeIfAbsent(c.cateId(), k -> new TreeSet<>()).add(c.fromVer()));
        List<CodeCateItemRow> cateItems = rows.cateItems().stream()
                .filter(ci -> hits(released, ci.fromVer(), ci.toVer())
                        || hits(tableFroms.getOrDefault(ci.cateId(), Collections.emptyNavigableSet()), ci.fromVer(), ci.toVer()))
                .toList();
        return new CodeRows(rows.header(), versions, items, categories, cateItems);
    }

    private static <T> List<T> keep(List<T> rows, NavigableSet<BigDecimal> released, Function<T, BigDecimal> from,
                                    Function<T, BigDecimal> to) {
        return rows.stream().filter(r -> hits(released, from.apply(r), to.apply(r))).toList();
    }

    /** 정렬한 버전 집합에 {@code from <= v < to} 인 v 가 있는가. */
    private static boolean hits(NavigableSet<BigDecimal> vers, BigDecimal from, BigDecimal to) {
        BigDecimal first = vers.ceiling(from);
        return first != null && first.compareTo(to) < 0;
    }
}
