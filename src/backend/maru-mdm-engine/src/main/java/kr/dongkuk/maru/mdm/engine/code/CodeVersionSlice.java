package kr.dongkuk.maru.mdm.engine.code;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;

/**
 * 마루 코드 버전 본문 하나(D-154, 스펙 2026-10-03-mdm-meta-cache-per-version §3.3) — MDM 메타 피드 {@code CODE:X@ver} 값이자 업무 모듈 캐시 본문.
 * JSON 칸 이름은 record 구성 요소 그대로다({@code maruCodeId, ver, items, categories[{cateId, fromVer, toVer, defKind, defExpr, defTarget, all,
 * members}]}). {@link #rows}·{@link #membersOf} 는 인자를 받으므로 Jackson 속성이 아니다.
 *
 * @param items      이 버전에 유효한 코드 행({@code fromVer <= ver < toVer}) — fromVer·toVer 는 원본 그대로
 * @param categories cateId 마다 {@code Segments.coveringOrEarliest} 로 고른 정의 하나와 소속. 고른 정의가 없는 cateId 는 없다
 */
public record CodeVersionSlice(String maruCodeId, BigDecimal ver, List<CodeItemRow> items, List<SlicedCategory> categories) {

    private static final String TABLE = "TABLE";
    private static final BigDecimal OPEN_VER = new BigDecimal("9999.000");

    /**
     * 고른 정의 하나와 소속. {@code all} 이면 소속이 이 본문 items 의 코드 전체이고 {@code members} 는 null 이다(이름이 아니라 집합 비교로 판단).
     * 정의는 있는데 소속이 없으면 {@code all=false, members=[]}.
     */
    public record SlicedCategory(String cateId, BigDecimal fromVer, BigDecimal toVer, String defKind, String defExpr, String defTarget,
                                 boolean all, List<String> members) {
    }

    /**
     * 엔진 {@code CodeLookup.codeAt} 이 줄 행 — {@code (header, [version], items, 고른 정의들, 합성 cateItems)}. TABLE 소속은
     * {@code CodeCateItemRow(cateId, code, max(정의 fromVer, ver), 9999.000)} 한 줄씩 합성한다. 그래서 {@code CodeEffLookup} 이 빈 값을 줘도 해석기가
     * 이 행으로 계산한 소속이 미리 계산한 소속과 같다(REGEX 는 items 와 정의로 다시 계산해도 같다).
     */
    public CodeRows rows(CodeHeader header, CodeVersionRow version) {
        List<CodeCateRow> defs = new ArrayList<>(categories.size());
        List<CodeCateItemRow> synthesized = new ArrayList<>();
        for (SlicedCategory c : categories) {
            defs.add(new CodeCateRow(c.cateId(), c.fromVer(), c.toVer(), c.defKind(), c.defExpr(), c.defTarget()));
            if (TABLE.equals(c.defKind())) {
                BigDecimal effVer = c.fromVer().max(ver);
                for (String code : membersOf(c.cateId())) {
                    synthesized.add(new CodeCateItemRow(c.cateId(), code, effVer, OPEN_VER));
                }
            }
        }
        return new CodeRows(header, List.of(version), items, defs, synthesized);
    }

    /** 소속 코드(순서 유지). {@code cateId} 는 호출자가 BASE 로 정규화한 값이다. 본문에 없는 cateId 는 빈 집합, {@code all} 이면 items 코드 전체. */
    public Set<String> membersOf(String cateId) {
        for (SlicedCategory c : categories) {
            if (c.cateId().equals(cateId)) {
                if (c.all()) {
                    Set<String> codes = new LinkedHashSet<>();
                    items.forEach(i -> codes.add(i.code()));
                    return codes;
                }
                return new LinkedHashSet<>(c.members());
            }
        }
        return Set.of();
    }
}
