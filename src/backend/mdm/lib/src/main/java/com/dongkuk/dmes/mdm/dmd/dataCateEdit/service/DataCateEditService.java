package com.dongkuk.dmes.mdm.dmd.dataCateEdit.service;

import static com.dongkuk.dmes.mdm.common.support.MdmErrors.invalid;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.segment.CateSegmentRow;
import com.dongkuk.dmes.mdm.common.segment.DataCategoryResolver;
import com.dongkuk.dmes.mdm.common.segment.DataCategorySegmentCore;
import com.dongkuk.dmes.mdm.common.segment.DataCateValue;
import com.dongkuk.dmes.mdm.common.segment.DataItemChecks;
import com.dongkuk.dmes.mdm.common.segment.DataItemMessages;
import com.dongkuk.dmes.mdm.common.segment.DataSegmentRowStore;
import com.dongkuk.dmes.mdm.common.segment.ItemSegmentRow;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateCompareRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateCompareResult;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateRegRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateRow;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateSearchRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateSearchResult;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateViewRequest;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.CateViewResult;
import com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto.MemberApplyRequest;
import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.hibernate.query.NativeQuery;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 카테고리 편집({@code dataCateEdit}) OASIS 진입 서비스 — design.md §1·§2. BPMN {@code services/dmd/dataCateEdit.bpmn}
 * 의 분기와 1:1 이다: {@code search→search}, {@code view→view}, {@code compare→compare}, {@code reg→register},
 * {@code save→save}, {@code delete→close}, {@code restore→reopen}.
 *
 * <p>{@code reg}·{@code save}(REGEX 정의 수정)·{@code delete}·{@code restore} 는 {@link DataCategorySegmentCore} 를
 * 그대로 호출한다(잠금·검사는 그 메서드들이 이미 갖고 있다 — 이 서비스는 스스로 {@link com.dongkuk.dmes.mdm.common.segment.DataSegmentLock}
 * 을 부르지 않는다, R2′). {@code save}(TABLE 소속 일괄 적용)는 {@link DataCategorySegmentCore#applyMembers} 한 번으로
 * 추가·해제 N 건을 한 트랜잭션에 적용한다(전부-아니면-전무, R12) — 잠금은 그 안에서 한 번이고, 이 서비스의 트랜잭션은
 * join(기본 전파 REQUIRED)일 뿐 이중 잠금이 아니다.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — CGLIB 프록시가 파라미터명을 지워 OASIS 바인딩이 죽는다(F18).
 */
@Service("dataCateEditService")
public class DataCateEditService {

    private static final Logger log = LoggerFactory.getLogger(DataCateEditService.class);

    private final EntityManager entityManager;
    private final DataSegmentRowStore rows;
    private final DataCategorySegmentCore categorySegmentCore;
    private final DataCategoryResolver resolver;
    private final TransactionTemplate readTx;
    private final TransactionTemplate tx;

    public DataCateEditService(EntityManager entityManager, DataSegmentRowStore rows,
                               DataCategorySegmentCore categorySegmentCore, DataCategoryResolver resolver,
                               PlatformTransactionManager transactionManager) {
        this.entityManager = entityManager;
        this.rows = rows;
        this.categorySegmentCore = categorySegmentCore;
        this.resolver = resolver;
        this.readTx = new TransactionTemplate(transactionManager);
        this.readTx.setReadOnly(true);
        this.tx = new TransactionTemplate(transactionManager);
    }

    // ── action: search ──────────────────────────────────────────────────────

    public CateSearchResult search(CateSearchRequest request) {
        String maruDataId = requireId(request == null ? null : request.getMaruDataId());
        return readTx.execute(status -> {
            Header header = header(maruDataId);
            List<ItemSegmentRow> openItems = openItemRows(maruDataId);
            Set<String> openItemCodes = codes(openItems);
            List<CateRow> list = new ArrayList<>();
            for (CateSegmentRow cate : rows.latestCateRows(maruDataId)) {
                list.add(toCateRow(maruDataId, cate, openItemCodes, openItems));
            }
            CateSearchResult result = new CateSearchResult();
            result.setMaruDataId(maruDataId);
            result.setMaruDataName(header.name());
            result.setLvlCnt(header.lvlCnt());
            result.setAttrLabels(header.attrLabels());
            result.setList(list);
            log.info("[dataCateEdit] search — maruDataId={} count={}", maruDataId, list.size());
            return result;
        });
    }

    // ── action: view ────────────────────────────────────────────────────────

    public CateViewResult view(CateViewRequest request) {
        String maruDataId = requireId(request == null ? null : request.getMaruDataId());
        String cateId = requireCateId(request == null ? null : request.getCateId());
        return readTx.execute(status -> buildView(maruDataId, cateId));
    }

    // ── action: compare ─────────────────────────────────────────────────────

    /** REGEX 미리보기 — 저장 전 후보 defExpr·defTarget 을 재해석한다(04 선례). */
    public CateCompareResult compare(CateCompareRequest request) {
        String maruDataId = requireId(request == null ? null : request.getMaruDataId());
        String defExpr = trim(request.getDefExpr());
        String defTarget = trim(request.getDefTarget());
        if (defExpr == null || defTarget == null) {
            throw invalid("식과 대상을 입력하세요");
        }
        return readTx.execute(status -> {
            DataCategoryResolver.Preview preview = resolver.preview(maruDataId, defExpr, defTarget);
            CateCompareResult result = new CateCompareResult();
            result.setInvalid(preview.invalid());
            result.setCodes(preview.codes());
            result.setCount(preview.count());
            result.setItems(preview.matches().stream()
                    .map(m -> new CateCompareResult.Item(m.code(), m.name()))
                    .toList());
            return result;
        });
    }

    // ── action: reg ──────────────────────────────────────────────────────────

    public CateViewResult register(CateRegRequest request) {
        if (request == null) {
            throw invalid("등록할 값이 없습니다");
        }
        String maruDataId = requireId(request.getMaruDataId());
        String cateId = requireCateId(request.getCateId());
        DataCateValue value = new DataCateValue(trim(request.getCateName()), trim(request.getDefKind()),
                trim(request.getDefExpr()), trim(request.getDefTarget()), trim(request.getDescription()));
        return tx.execute(status -> {
            categorySegmentCore.registerCate(maruDataId, cateId, value);
            log.info("[dataCateEdit] reg — maruDataId={} cateId={}", maruDataId, cateId);
            return buildView(maruDataId, cateId);
        });
    }

    // ── action: save — REGEX 정의 수정 또는 TABLE 소속 일괄 적용(대상 카테고리의 실제 defKind 로 가른다) ──

    /**
     * {@code addCodes}·{@code removeCodes} 는 params 가 아니라 grids 로 받는다(행마다 {@code code}). OASIS 요청 변환기는
     * params 의 JSON 배열을 타입 힌트 없이 감싸 "Generic type. You must explicitly specify the type" 로 거부한다
     * ({@code TermSaveRequest} 주석과 같은 제약) — grids 는 파라미터 이름으로 {@code List<Map>} 에 묶인다(codeCateEdit 선례).
     * REGEX 저장은 grids 를 보내지 않으므로 BPMN saveTask 가 두 인자를 {@code opt}(선택 인자)로 둔다 — 빠지면 null 이다.
     */
    public CateViewResult save(CateSaveRequest request, List<Map<String, Object>> addCodes,
                               List<Map<String, Object>> removeCodes) {
        if (request == null) {
            throw invalid("저장할 값이 없습니다");
        }
        String maruDataId = requireId(request.getMaruDataId());
        String cateId = requireCateId(request.getCateId());
        return tx.execute(status -> {
            CateSegmentRow current = latestCate(maruDataId, cateId);
            if (current != null && DataCateValue.TABLE.equals(current.value().defKind())) {
                applyMembers(new MemberApplyRequest(maruDataId, cateId, codesOf(addCodes), codesOf(removeCodes)));
            } else {
                DataCateValue value = new DataCateValue(trim(request.getCateName()),
                        current == null ? DataCateValue.REGEX : current.value().defKind(), trim(request.getDefExpr()),
                        trim(request.getDefTarget()), trim(request.getDescription()));
                categorySegmentCore.modifyCate(maruDataId, cateId, value);
            }
            log.info("[dataCateEdit] save — maruDataId={} cateId={}", maruDataId, cateId);
            return buildView(maruDataId, cateId);
        });
    }

    /** grids 행에서 {@code code} 만 모은다. 빈 값은 건너뛴다. */
    private static List<String> codesOf(List<Map<String, Object>> rows) {
        if (rows == null) {
            return List.of();
        }
        List<String> codes = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Object code = row == null ? null : row.get("code");
            if (code != null && !code.toString().isBlank()) {
                codes.add(code.toString().trim());
            }
        }
        return codes;
    }

    /**
     * R12 — 추가·해제 목록 중 하나라도 실패하면 전체 롤백. {@link DataCategorySegmentCore#applyMembers} 가 한 번만 잠그고(R2′)
     * 그 안에서 대상 행을 한 번에 읽는다 — 잠금이 먼저라는 말은 {@code applyMembers} 안의 읽기에 대한 것이고, 위
     * {@code latestCate} 는 예전처럼 잠금 전에 읽는다. 소속마다 {@code addMember}/{@code removeMember} 를 부르던 것과 판정·오류 순서가 같다.
     */
    private void applyMembers(MemberApplyRequest request) {
        categorySegmentCore.applyMembers(request.maruDataId(), request.cateId(), request.addCodes(),
                request.removeCodes());
    }

    // ── action: delete(닫기) ───────────────────────────────────────────────

    public CateViewResult close(CateViewRequest request) {
        String maruDataId = requireId(request == null ? null : request.getMaruDataId());
        String cateId = requireCateId(request == null ? null : request.getCateId());
        return tx.execute(status -> {
            categorySegmentCore.closeCate(maruDataId, cateId);
            log.info("[dataCateEdit] delete — maruDataId={} cateId={}", maruDataId, cateId);
            return buildView(maruDataId, cateId);
        });
    }

    // ── action: restore(다시 열기) ─────────────────────────────────────────

    public CateViewResult reopen(CateViewRequest request) {
        String maruDataId = requireId(request == null ? null : request.getMaruDataId());
        String cateId = requireCateId(request == null ? null : request.getCateId());
        return tx.execute(status -> {
            categorySegmentCore.reopenCate(maruDataId, cateId);
            log.info("[dataCateEdit] restore — maruDataId={} cateId={}", maruDataId, cateId);
            return buildView(maruDataId, cateId);
        });
    }

    // ── 공통 읽기 ──────────────────────────────────────────────────────────

    /** 카테고리 하나의 지금 상태 — R5(열린 항목만 매칭 대상)·R4(닫기는 소속 행에 연쇄하지 않는다, 소속은 DB 에 그대로 남는다). */
    private CateViewResult buildView(String maruDataId, String cateId) {
        CateSegmentRow cate = latestCate(maruDataId, cateId);
        if (cate == null) {
            throw keyIssue(DataItemMessages.KEY_NOT_FOUND + ": " + cateId, cateId);
        }
        List<ItemSegmentRow> openItems = openItemRows(maruDataId);
        Set<String> openItemCodes = codes(openItems);
        CateRow row = toCateRow(maruDataId, cate, openItemCodes, openItems);
        CateViewResult result = new CateViewResult();
        result.setCate(row);
        if (row.isOpen() && DataCateValue.TABLE.equals(row.getDefKind())) {
            List<CateViewResult.Item> items = new ArrayList<>();
            for (ItemSegmentRow item : openItems) {
                items.add(new CateViewResult.Item(item.key().code(), item.value().name(), item.value().lvl(1)));
            }
            result.setItems(items);
            Set<String> members = new LinkedHashSet<>(rows.openMemberCodes(maruDataId, cateId));
            members.retainAll(openItemCodes);
            result.setMemberCodes(new ArrayList<>(members));
        }
        return result;
    }

    /** 카테고리별 마지막 행(닫힌 것 포함) 한 건. 없으면 null. */
    private CateSegmentRow latestCate(String maruDataId, String cateId) {
        List<CateSegmentRow> own = rows.cateRows(maruDataId, cateId);
        return own.isEmpty() ? null : own.get(own.size() - 1);
    }

    /**
     * R5 — 매칭·소속 판정은 항상 "카테고리가 지금 열려 있는가"를 먼저 본다. 닫힌 카테고리는 종류 무관 0. REGEX 건수는
     * 호출자가 한 번 읽은 열린 항목 행({@code openItems})으로 센다 — 카테고리마다 항목 행을 다시 읽지 않는다(미리보기는 열린
     * 행만 보므로 결과가 같다).
     */
    private CateRow toCateRow(String maruDataId, CateSegmentRow cate, Set<String> openItemCodes,
                              List<ItemSegmentRow> openItems) {
        boolean open = cate.isOpen();
        int matchCount = 0;
        DataCateValue v = cate.value();
        if (open) {
            if (DataCateValue.REGEX.equals(v.defKind())) {
                matchCount = DataCategoryResolver.preview(openItems, v.defExpr(), v.defTarget()).count();
            } else if (DataCateValue.TABLE.equals(v.defKind())) {
                matchCount = (int) rows.openMemberCodes(maruDataId, cate.key().cateId()).stream()
                        .filter(openItemCodes::contains).count();
            }
        }
        CateRow row = new CateRow();
        row.setCateId(cate.key().cateId());
        row.setCateName(v.cateName());
        row.setDefKind(v.defKind());
        row.setDefExpr(v.defExpr());
        row.setDefTarget(v.defTarget());
        row.setDescription(v.description());
        row.setOpen(open);
        row.setMatchCount(matchCount);
        return row;
    }

    private List<ItemSegmentRow> openItemRows(String maruDataId) {
        return rows.latestItemRows(maruDataId).stream().filter(ItemSegmentRow::isOpen).toList();
    }

    private static Set<String> codes(List<ItemSegmentRow> items) {
        return items.stream().map(r -> r.key().code()).collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private record Header(String maruDataId, String name, int lvlCnt, List<String> attrLabels) {
    }

    /** {@code TB_MDM_DATA} 머리(이름·계층 칸 수·라벨) — 읽기 전용, 잠그지 않는다(R2′, {@code DataItemListQuery.header()} 선례). */
    private Header header(String maruDataId) {
        List<?> found = entityManager.createNativeQuery("SELECT MARU_DATA_NAME, LVL_CNT, ATTR01_NAME, ATTR02_NAME, "
                        + "ATTR03_NAME, ATTR04_NAME, ATTR05_NAME, ATTR06_NAME, ATTR07_NAME, ATTR08_NAME, ATTR09_NAME, "
                        + "ATTR10_NAME FROM TB_MDM_DATA WHERE MARU_DATA_ID = :md").unwrap(NativeQuery.class)
                .setParameter("md", maruDataId, String.class)
                .getResultList();
        if (found.isEmpty()) {
            throw invalid(DataItemMessages.NO_MARU_DATA + ": " + maruDataId);
        }
        Object[] r = (Object[]) found.get(0);
        List<String> labels = new ArrayList<>(10);
        for (int i = 0; i < 10; i++) {
            labels.add((String) r[2 + i]);
        }
        return new Header(maruDataId, (String) r[0], ((Number) r[1]).intValue(), labels);
    }

    // ── 공통 ────────────────────────────────────────────────────────────────

    private static String requireId(String maruDataId) {
        String v = trim(maruDataId);
        if (v == null) {
            throw invalid("마루 데이터 ID 를 입력하세요");
        }
        return v;
    }

    private static String requireCateId(String cateId) {
        String v = trim(cateId);
        if (v == null) {
            throw DataItemChecks.rejected(List.of(new MdmCheckIssue("CHK3", DataItemMessages.KEY_REQUIRED, "cateId",
                    cateId)));
        }
        return v;
    }

    private static RuntimeException keyIssue(String message, String key) {
        return DataItemChecks.rejected(List.of(new MdmCheckIssue("KEY", message, "key", key)));
    }

    private static String trim(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
