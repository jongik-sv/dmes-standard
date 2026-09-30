package com.dongkuk.dmes.mdm.dmd.dataItemMng.service;

import static com.dongkuk.dmes.mdm.dmd.dataItemMng.service.DataItemRows.blankToNull;

import com.dongkuk.dmes.mdm.common.segment.CateSegmentRow;
import com.dongkuk.dmes.mdm.common.segment.DataItemSaveCore;
import com.dongkuk.dmes.mdm.common.segment.DataItemValue;
import com.dongkuk.dmes.mdm.common.segment.ItemSegmentRow;
import com.dongkuk.dmes.mdm.common.segment.SaveOutcome;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.category.CategoryConventions;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemHeader;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemKeyRequest;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemRow;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemSaveResult;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemSearchRequest;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemSearchResult;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemViewRequest;
import com.dongkuk.dmes.mdm.dmd.dataItemMng.dto.DataItemViewResult;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 항목 관리({@code dataItemMng}) OASIS 진입 서비스 — TSK-07-03 design.md §2. BPMN {@code services/dmd/dataItemMng.bpmn} 의
 * 분기와 1:1 이다: view·search(READ), reg→{@link #register}·save→{@link #modify}·delete→{@link #close}·
 * restore→{@link #reopen}(EDIT, D9).
 *
 * <p>쓰기 넷은 {@link DataItemSaveCore}(화면 경로) 에 위임한다. 읽기는 읽기 전용 {@link TransactionTemplate} 으로 OASIS
 * 트랜잭션에 합류한다.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — CGLIB 프록시가 파라미터명을 지워 OASIS 바인딩이
 * {@code ParameterName must not be null} 로 죽는다(F11).
 */
@Service("dataItemMngService")
public class DataItemMngService {

    private static final Logger log = LoggerFactory.getLogger(DataItemMngService.class);

    static final int DEFAULT_SIZE = 50;
    /**
     * 목록 조회 상한. 트리({@link #TREE_MAX})와 같은 규칙이다 — 여기까지 왔으면 잘렸다는 뜻이고, 그 사실을
     * 응답의 {@code truncated} 로 그대로 말한다(조용히 자르지 않는다).
     *
     * <p>2026-09-30 — 구 {@code MAX_SIZE = 200} 에서 올렸다. 항목 편집 화면이 페이징을 없애고 조건에 맞는 항목을
     * 한 번에 전부 그리드에 얹기로 해서다(실측: {@code CUS_CD} 고객사코드 = 10,704행). design.md Q3 이 미리 적은
     * 함정 "상한 제거" 는 피하려고 <b>상한은 남겼다</b> — 대신 잘렸을 때 {@code truncated} 로 알린다.
     */
    static final int ITEMS_MAX = 20000;
    /** 트리 조회 상한(비페이징, design.md §2). 이만큼 왔으면 잘렸다는 뜻(treeTruncated). */
    static final int TREE_MAX = 2000;

    private final DataItemSaveCore core;
    private final DataItemListQuery query;
    private final TransactionTemplate readTx;

    public DataItemMngService(DataItemSaveCore core, DataItemListQuery query, PlatformTransactionManager transactionManager) {
        this.core = core;
        this.query = query;
        this.readTx = new TransactionTemplate(transactionManager);
        this.readTx.setReadOnly(true);
    }

    // ── action: view ────────────────────────────────────────────────────────

    public DataItemViewResult view(DataItemViewRequest request) {
        String md = request == null ? null : blankToNull(request.getMaruDataId());
        return readTx.execute(status -> new DataItemViewResult(query.maruDataOptions(),
                md == null ? null : requireHeader(query, md)));
    }

    // ── action: search ──────────────────────────────────────────────────────

    public DataItemSearchResult search(DataItemSearchRequest request) {
        String md = request == null ? null : blankToNull(request.getMaruDataId());
        if (md == null) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "마루 데이터를 고르세요", List.of());
        }
        int page = Math.max(0, request.getPage() == null ? 0 : request.getPage());
        int size = request.getSize() == null ? DEFAULT_SIZE : Math.max(1, Math.min(ITEMS_MAX, request.getSize()));
        String cateId = blankToNull(request.getCateId());
        String nodeFilter = blankToNull(request.getNodeFilter());
        boolean showClosed = Boolean.TRUE.equals(request.getShowClosed());
        DataItemListQuery.Page result = readTx.execute(status -> {
            CateSegmentRow cate = query.openCate(md, cateId == null ? CategoryConventions.BASE_CATE_ID : cateId);
            if (cate == null && cateId != null) {
                throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "없는 카테고리입니다: " + cateId, List.of());
            }
            return query.page(md, blankToNull(request.getCode()), blankToNull(request.getName()), nodeFilter, cate,
                    showClosed, page, size);
        });
        log.info("[dataItemMng] search — md={} cate={} node={} page={} size={} total={}", md, cateId, nodeFilter, page,
                size, result.total());
        List<DataItemRow> rows = result.rows().stream().map(DataItemRows::toRow).toList();
        // 목록이 상한에 걸려 잘렸는가 — totalCount(필터 뒤 전체 수)보다 received 가 적으면 잘린 것이다.
        boolean truncated = result.total() > rows.size();
        if (truncated) {
            log.warn("[dataItemMng] search — 목록이 상한에 걸려 잘렸다: md={} 받은={} 전체={} 상한={}", md, rows.size(),
                    result.total(), ITEMS_MAX);
        }
        List<DataItemRow> tree = null;
        boolean treeTruncated = false;
        if (Boolean.TRUE.equals(request.getWithTree())) {
            List<ItemSegmentRow> treeRows = readTx.execute(status -> query.treeRows(md, TREE_MAX));
            tree = treeRows.stream().map(DataItemRows::toRow).toList();
            treeTruncated = treeRows.size() == TREE_MAX;
        }
        return new DataItemSearchResult(rows, result.total(), page, size, truncated, tree, treeTruncated);
    }

    // ── action: reg / save / delete / restore ──────────────────────────────

    public DataItemSaveResult register(DataItemSaveRequest request) {
        String md = requireMaruData(request == null ? null : request.getMaruDataId());
        DataItemValue value = DataItemRows.toValue(request);
        return result(core.register(md, blankToNull(request.getCode()), value));
    }

    public DataItemSaveResult modify(DataItemSaveRequest request) {
        String md = requireMaruData(request == null ? null : request.getMaruDataId());
        int expected = requireRowVersion(request.getExpectedRowVersion());
        return result(core.modify(md, blankToNull(request.getCode()), DataItemRows.toValue(request), expected));
    }

    public DataItemSaveResult close(DataItemKeyRequest request) {
        String md = requireMaruData(request == null ? null : request.getMaruDataId());
        return result(core.close(md, blankToNull(request.getCode()), requireRowVersion(request.getExpectedRowVersion())));
    }

    public DataItemSaveResult reopen(DataItemKeyRequest request) {
        String md = requireMaruData(request == null ? null : request.getMaruDataId());
        return result(core.reopen(md, blankToNull(request.getCode()), requireRowVersion(request.getExpectedRowVersion())));
    }

    // ── 공통 ────────────────────────────────────────────────────────────────

    static DataItemHeader requireHeader(DataItemListQuery query, String md) {
        DataItemHeader header = query.header(md);
        if (header == null) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "없는 마루 데이터입니다: " + md, List.of());
        }
        return header;
    }

    private static DataItemSaveResult result(SaveOutcome outcome) {
        log.info("[dataItemMng] {} — {} at={}", outcome.action(), outcome.latest().key(), outcome.at());
        return new DataItemSaveResult(outcome.action().name(), DataItemRows.toRow(outcome.latest()),
                DataItemRows.text(outcome.at()));
    }

    private static String requireMaruData(String md) {
        String id = blankToNull(md);
        if (id == null) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "마루 데이터를 고르세요", List.of());
        }
        return id;
    }

    private static int requireRowVersion(Integer expected) {
        if (expected == null) {
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "row_version 이 없습니다. 다시 불러오세요", List.of());
        }
        return expected;
    }
}
