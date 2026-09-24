package kr.dongkuk.maru.mdm.engine.code;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 마루 데이터 하나의 판정용 행 묶음(05 ERD 05:599-705 중 판정에 쓰는 칸, TSK-03-02 design D1·§6.11).
 * {@link MasterDataResolver} 에 행을 공급하는 쪽(원장·사본 서버)이 채운다. 일시는 KST 벽시계,
 * 열린 끝은 {@code 9999-12-31T00:00}.
 */
public record MasterDataRows(
        DataHeader header, List<DataItemRow> items, List<DataCateRow> categories, List<DataCateItemRow> cateItems) {

    /** TB_MDM_DATA — 폐기되면 {@code closedAt} 부터 판정이 false 다(05 ①). */
    public record DataHeader(String maruDataId, String status, LocalDateTime closedAt) {}

    /**
     * TB_MDM_DATA_ITEM 선분 행.
     *
     * @param lvl   lvl1-lvl5, 길이 5(빈 칸 null)
     * @param attrs attr01-attr10, 길이 10(빈 칸 null)
     */
    public record DataItemRow(String code, String name, String alterName, Integer seq,
                              List<String> lvl, List<String> attrs, LocalDateTime validFrom, LocalDateTime validTo) {}

    /** TB_MDM_DATA_CATE 선분 행 — defKind REGEX/TABLE, defTarget KEY·LVL1-5·ATTR01-10(REGEX 전용). */
    public record DataCateRow(String cateId, String defKind, String defExpr, String defTarget,
                              LocalDateTime validFrom, LocalDateTime validTo) {}

    /** TB_MDM_DATA_CATE_ITEM 선분 행 — TABLE 소속. */
    public record DataCateItemRow(String cateId, String code, LocalDateTime validFrom, LocalDateTime validTo) {}
}
