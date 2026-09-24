package kr.dongkuk.maru.mdm.engine.code;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import java.util.regex.Pattern;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows.DataCateItemRow;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows.DataCateRow;
import kr.dongkuk.maru.mdm.engine.code.MasterDataRows.DataItemRow;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;

/**
 * 05 마루 데이터 참고 판정기(05 「판정 참고 구현」 05:417-470, TSK-03-02 design D1·§6.11).
 * spi {@link MasterLookup} 의 "05 대로 하는 구현"이다. 원장·사본 서버는 행 공급 함수만 주고 이것을 그대로 쓴다.
 *
 * <p>유효 = ① 데이터가 있고 {@code closed_at} 앞 ② 항목 선분 행 ③ 카테고리 선분 행 ④ 소속
 * (REGEX 는 ②의 대상 칸 값에 ③의 정규식 전체 일치, TABLE 은 소속 선분 행). 선분은 {@code valid_from <= dt < valid_to},
 * 가장 이른 행보다 앞이면 그 행(최초 행 소급). 원장 방식(정규식 직접 대조, 05:457)이라 사본 캐시
 * {@code TB_MDM_DATA_CATE_EFF} 는 쓰지 않는다. 결과는 같다.
 */
public final class MasterDataResolver implements MasterLookup {

    private static final String BASE = "BASE";
    private static final String REGEX = "REGEX";
    private static final String TABLE = "TABLE";

    private final Function<String, Optional<MasterDataRows>> source;
    private final Map<String, Pattern> patterns = new ConcurrentHashMap<>();

    /** @param source 마루 데이터 ID → 행 묶음. 없으면 빈 값 */
    public MasterDataResolver(Function<String, Optional<MasterDataRows>> source) {
        this.source = Objects.requireNonNull(source, "source");
    }

    @Override
    public boolean isValid(String maruDataId, String cateId, String key, LocalDateTime baseDt) {
        return validItem(maruDataId, cateId, key, baseDt).isPresent();
    }

    @Override
    public Optional<String> attr(String maruDataId, String cateId, String key, LocalDateTime baseDt, int attrNo) {
        return validItem(maruDataId, cateId, key, baseDt).map(i -> i.attrs().get(attrNo - 1));
    }

    /** 네 조건을 모두 만족하면 ②의 항목 선분 행. */
    private Optional<DataItemRow> validItem(String maruDataId, String cateId, String key, LocalDateTime baseDt) {
        if (key == null) {
            return Optional.empty();
        }
        Optional<MasterDataRows> found = source.apply(maruDataId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        MasterDataRows rows = found.get();
        LocalDateTime closedAt = rows.header().closedAt();
        if (closedAt != null && !baseDt.isBefore(closedAt)) {
            return Optional.empty();
        }
        String cate = cateId == null || cateId.isEmpty() ? BASE : cateId;
        List<DataItemRow> itemRows = rows.items().stream().filter(i -> i.code().equals(key)).toList();
        Optional<DataItemRow> item =
                Segments.coveringOrEarliest(itemRows, DataItemRow::validFrom, DataItemRow::validTo, baseDt);
        List<DataCateRow> cateRows = rows.categories().stream().filter(c -> c.cateId().equals(cate)).toList();
        Optional<DataCateRow> category =
                Segments.coveringOrEarliest(cateRows, DataCateRow::validFrom, DataCateRow::validTo, baseDt);
        if (item.isEmpty() || category.isEmpty()) {
            return Optional.empty();
        }
        return belongs(rows, category.get(), item.get(), baseDt) ? item : Optional.empty();
    }

    private boolean belongs(MasterDataRows rows, DataCateRow category, DataItemRow item, LocalDateTime baseDt) {
        if (REGEX.equals(category.defKind())) {
            String target = target(item, category.defTarget());
            return target != null && patterns.computeIfAbsent(category.defExpr(), Pattern::compile).matcher(target).matches();
        }
        if (TABLE.equals(category.defKind())) {
            List<DataCateItemRow> members = rows.cateItems().stream()
                    .filter(ci -> ci.cateId().equals(category.cateId()) && ci.code().equals(item.code()))
                    .toList();
            return Segments.coveringOrEarliest(members, DataCateItemRow::validFrom, DataCateItemRow::validTo, baseDt)
                    .isPresent();
        }
        return false;
    }

    /** {@code def_target} 칸 값 — KEY(기본), LVL1-LVL5, ATTR01-ATTR10(05:147). */
    private static String target(DataItemRow item, String defTarget) {
        if (defTarget == null || defTarget.equals("KEY")) {
            return item.code();
        }
        if (defTarget.startsWith("LVL")) {
            return item.lvl().get(Integer.parseInt(defTarget.substring(3)) - 1);
        }
        if (defTarget.startsWith("ATTR")) {
            return item.attrs().get(Integer.parseInt(defTarget.substring(4)) - 1);
        }
        throw new IllegalStateException("알 수 없는 def_target: " + defTarget);
    }
}
