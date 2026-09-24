package com.dongkuk.dmes.mdm.dmd.dataHistory.service;

import static com.dongkuk.dmes.mdm.dmd.dataItemMng.service.DataItemRows.text;

import com.dongkuk.dmes.mdm.common.segment.CateItemSegmentRow;
import com.dongkuk.dmes.mdm.common.segment.CateSegmentRow;
import com.dongkuk.dmes.mdm.common.segment.DataItemMessages;
import com.dongkuk.dmes.mdm.common.segment.DataSegmentRowStore;
import com.dongkuk.dmes.mdm.common.segment.ItemSegmentRow;
import com.dongkuk.dmes.mdm.common.segment.SegmentRow;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmd.dataHistory.dto.DataHistoryRequest;
import com.dongkuk.dmes.mdm.dmd.dataHistory.dto.DataHistoryResult;
import com.dongkuk.dmes.mdm.dmd.dataHistory.dto.DataHistoryRow;
import com.dongkuk.dmes.mdm.dmd.dataHistory.dto.DataHistoryViewRequest;
import com.dongkuk.dmes.mdm.dmd.dataHistory.dto.DataHistoryViewResult;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemHeader;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemRow;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.service.DataItemListQuery;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.service.DataItemRows;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 항목 이력({@code dataHistory}) OASIS 진입 서비스 — TSK-07-03 design.md §2, 01 「이력 조회」 생성·변경·소멸.
 *
 * <p>(마루 데이터, 대상 = ITEM·CATE·CATE_ITEM, 키)의 선분 행을 valid_from 오름차순으로 전부 돌려준다(H1). 사건 이름·빈
 * 구간·행 상태·마지막 상태는 서버가 계산한다(H2) — 화면은 그대로 그린다. 읽기 전용이라 잠금을 잡지 않는다.
 * {@code @Transactional} 을 붙이지 않는다(F11).
 */
@Service("dataHistoryService")
public class DataHistoryService {

    static final String ITEM = "ITEM";
    static final String CATE = "CATE";
    static final String CATE_ITEM = "CATE_ITEM";

    private final DataSegmentRowStore rows;
    private final DataItemListQuery query;
    private final TransactionTemplate readTx;

    public DataHistoryService(DataSegmentRowStore rows, DataItemListQuery query,
                              PlatformTransactionManager transactionManager) {
        this.rows = rows;
        this.query = query;
        this.readTx = new TransactionTemplate(transactionManager);
        this.readTx.setReadOnly(true);
    }

    // ── action: view ────────────────────────────────────────────────────────

    public DataHistoryViewResult view(DataHistoryViewRequest request) {
        String md = request == null ? null : blankToNull(request.getMaruDataId());
        return readTx.execute(status -> new DataHistoryViewResult(query.maruDataOptions(),
                md == null ? null : header(md)));
    }

    // ── action: search ──────────────────────────────────────────────────────

    public DataHistoryResult search(DataHistoryRequest request) {
        String md = blankToNull(request == null ? null : request.getMaruDataId());
        if (md == null) {
            throw invalid("마루 데이터를 고르세요");
        }
        String key = blankToNull(request.getKey());
        if (key == null) {
            throw invalid(DataItemMessages.KEY_REQUIRED);
        }
        String target = blankToNull(request.getTarget()) == null ? ITEM : request.getTarget().trim();
        String cateId = blankToNull(request.getCateId());
        return readTx.execute(status -> {
            DataItemHeader header = header(md);
            List<DataHistoryRow> out = switch (target) {
                case ITEM -> build(rows.itemRows(md, key));
                case CATE -> build(rows.cateRows(md, key));
                case CATE_ITEM -> {
                    if (cateId == null) {
                        throw invalid("카테고리를 고르세요");
                    }
                    yield build(rows.cateItemRows(md, cateId, key));
                }
                default -> throw invalid("대상은 ITEM·CATE·CATE_ITEM 중 하나입니다: " + target);
            };
            return new DataHistoryResult(header, target, key, out, state(out));
        });
    }

    /**
     * H2 — 첫 행 CREATED, 앞 행 valid_to == valid_from 이면 CHANGED, 앞 행 valid_to < valid_from 이면 REOPENED 와 그 사이
     * 빈 구간. 마지막 행이 열렸으면 OPEN, 닫혔으면 CLOSED(소멸), 나머지는 PAST.
     */
    static List<DataHistoryRow> build(List<? extends SegmentRow> segments) {
        List<DataHistoryRow> out = new ArrayList<>(segments.size());
        for (int i = 0; i < segments.size(); i++) {
            SegmentRow row = segments.get(i);
            DataHistoryRow h = new DataHistoryRow();
            h.setValidFrom(text(row.validFrom()));
            h.setValidTo(text(row.validTo()));
            h.setOpen(row.isOpen());
            if (i == 0) {
                h.setEvent("CREATED");
            } else {
                SegmentRow prev = segments.get(i - 1);
                if (prev.validTo().isBefore(row.validFrom())) {
                    h.setEvent("REOPENED");
                    h.setGapFrom(text(prev.validTo()));
                    h.setGapTo(text(row.validFrom()));
                } else {
                    h.setEvent("CHANGED");
                }
            }
            boolean last = i == segments.size() - 1;
            h.setRowState(!last ? "PAST" : row.isOpen() ? "OPEN" : "CLOSED");
            fill(h, row);
            out.add(h);
        }
        return out;
    }

    private static void fill(DataHistoryRow h, SegmentRow row) {
        if (row instanceof ItemSegmentRow item) {
            DataItemRow v = DataItemRows.toRow(item);
            h.setName(v.getName());
            h.setAlterName(v.getAlterName());
            h.setSeq(v.getSeq());
            h.setDescription(v.getDescription());
            h.setLvl1(v.getLvl1());
            h.setLvl2(v.getLvl2());
            h.setLvl3(v.getLvl3());
            h.setLvl4(v.getLvl4());
            h.setLvl5(v.getLvl5());
            h.setAttr01(v.getAttr01());
            h.setAttr02(v.getAttr02());
            h.setAttr03(v.getAttr03());
            h.setAttr04(v.getAttr04());
            h.setAttr05(v.getAttr05());
            h.setAttr06(v.getAttr06());
            h.setAttr07(v.getAttr07());
            h.setAttr08(v.getAttr08());
            h.setAttr09(v.getAttr09());
            h.setAttr10(v.getAttr10());
            h.setRowVersion(v.getRowVersion());
        } else if (row instanceof CateSegmentRow cate) {
            h.setCateName(cate.value().cateName());
            h.setDefKind(cate.value().defKind());
            h.setDefTarget(cate.value().defTarget());
            h.setDefExpr(cate.value().defExpr());
        } else if (!(row instanceof CateItemSegmentRow)) {
            throw new IllegalArgumentException("알 수 없는 선분 행: " + row);
        }
    }

    private static String state(List<DataHistoryRow> out) {
        if (out.isEmpty()) {
            return "NONE";
        }
        return out.get(out.size() - 1).isOpen() ? "OPEN" : "CLOSED";
    }

    private DataItemHeader header(String md) {
        DataItemHeader header = query.header(md);
        if (header == null) {
            throw invalid("없는 마루 데이터입니다: " + md);
        }
        return header;
    }

    private static RuntimeException invalid(String detail) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, detail, List.of());
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
