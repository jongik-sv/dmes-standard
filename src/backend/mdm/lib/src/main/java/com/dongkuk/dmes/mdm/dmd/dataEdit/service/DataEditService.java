package com.dongkuk.dmes.mdm.dmd.dataEdit.service;

import com.dongkuk.dmes.mdm.common.segment.CateSegmentRow;
import com.dongkuk.dmes.mdm.common.segment.DataCategoryResolver;
import com.dongkuk.dmes.mdm.common.segment.DataCateValue;
import com.dongkuk.dmes.mdm.common.segment.DataItemChecks;
import com.dongkuk.dmes.mdm.common.segment.DataSegmentLock;
import com.dongkuk.dmes.mdm.common.segment.DataSegmentRowStore;
import com.dongkuk.dmes.mdm.common.segment.ItemSegmentRow;
import com.dongkuk.dmes.mdm.common.segment.LockedMaruData;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.CategorySummaryRow;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.DataEditDeprecateRequest;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.DataEditHeaderSaveRequest;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.DataEditView;
import com.dongkuk.dmes.mdm.dmd.dataEdit.dto.DataEditViewRequest;
import com.dongkuk.dmes.mdm.entity.MdmData;
import com.dongkuk.dmes.mdm.repository.MdmDataRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 마루 데이터 수정({@code dataEdit}) OASIS 진입 서비스 — design.md §1·§2. BPMN {@code services/dmd/dataEdit.bpmn} 의
 * 분기와 1:1 이다: {@code view→view}, {@code save→save}, {@code delete→deprecate}.
 *
 * <p>{@code save}·{@code deprecate} 는 이 서비스가 직접 쥔 {@link TransactionTemplate} 으로 {@code lock → 검사 → 갱신}
 * 을 한 번에 감싼다(R1′, F7 — OASIS 앰비언트 트랜잭션에 기대지 않는다). 값을 읽기 전에 {@link DataSegmentLock#lock}
 * 을 정확히 한 번 부른다(R2, L1). {@code view} 는 잠금을 걸지 않지만(05 문서 — 조회 시 잠금 요구 없음), 선분 저장소의
 * 네이티브 읽기가 활성 트랜잭션을 요구하므로({@code DataSegmentRowStore.query()} 계약, B1 build-log.md 「B2 가 참고할
 * 공개 시그니처」의 {@code TransactionRequiredException} 기록) 읽기 전용 {@link TransactionTemplate}(dataItemMng
 * {@code view} 선례)으로 감싼다.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — CGLIB 프록시가 파라미터명을 지워 OASIS 바인딩이
 * {@code ParameterName must not be null} 로 죽는다(F11·F18).
 */
@Service("dataEditService")
public class DataEditService {

    private static final Logger log = LoggerFactory.getLogger(DataEditService.class);

    static final int NAME_MAX = 100;
    static final int LABEL_MAX = 100;

    private final DataSegmentLock lock;
    private final DataItemChecks checks;
    private final DataSegmentRowStore rowStore;
    private final MdmDataRepository dataRepo;
    private final TransactionTemplate tx;
    private final TransactionTemplate readTx;

    public DataEditService(DataSegmentLock lock, DataItemChecks checks, DataSegmentRowStore rowStore,
                           MdmDataRepository dataRepo,
                           PlatformTransactionManager transactionManager) {
        this.lock = lock;
        this.checks = checks;
        this.rowStore = rowStore;
        this.dataRepo = dataRepo;
        this.tx = new TransactionTemplate(transactionManager);
        this.readTx = new TransactionTemplate(transactionManager);
        this.readTx.setReadOnly(true);
    }

    // ── action: view ────────────────────────────────────────────────────────

    public DataEditView view(DataEditViewRequest request) {
        String id = requireMaruData(request == null ? null : request.getMaruDataId());
        return readTx.execute(status -> {
            MdmData entity = dataRepo.findById(id).orElseThrow(DataEditService::noMaruData);
            return buildView(entity);
        });
    }

    // ── action: save(헤더+키 패턴+라벨+lvl_cnt, D3) ────────────────────────────

    public DataEditView save(DataEditHeaderSaveRequest request) {
        String id = requireMaruData(request == null ? null : request.getMaruDataId());
        return tx.execute(status -> {
            LockedMaruData locked = lock.lock(id); // R2 — 값을 읽기 전에 정확히 한 번
            checks.requireActive(locked); // R7 — DEPRECATED 는 모든 쓰기 거부

            String name = trimToNull(request.getMaruDataName());
            if (name == null || name.length() > NAME_MAX) {
                throw invalid("이름은 1~" + NAME_MAX + "자여야 합니다");
            }
            String codePattern = trimToNull(request.getCodePattern());
            if (codePattern == null) {
                throw invalid("키 패턴을 입력하세요");
            }
            try {
                Pattern.compile(codePattern);
            } catch (PatternSyntaxException e) {
                throw invalid("키 패턴 정규식이 올바르지 않습니다: " + codePattern);
            }
            int lvlCnt = request.getLvlCnt() == null ? locked.lvlCnt() : request.getLvlCnt();
            if (lvlCnt < 0 || lvlCnt > 5) {
                throw invalid("계층 칸 수는 0~5 이어야 합니다");
            }
            String[] labels = {
                label(request.getAttr01Name(), 1), label(request.getAttr02Name(), 2), label(request.getAttr03Name(), 3),
                label(request.getAttr04Name(), 4), label(request.getAttr05Name(), 5), label(request.getAttr06Name(), 6),
                label(request.getAttr07Name(), 7), label(request.getAttr08Name(), 8), label(request.getAttr09Name(), 9),
                label(request.getAttr10Name(), 10)};
            if (lvlCnt < locked.lvlCnt()) {
                requireNoValueBeyond(id, lvlCnt); // R11·D6 — latestItemRows(닫힌 키 포함) 스캔
            }

            MdmData entity = dataRepo.findById(id).orElseThrow(DataEditService::noMaruData);
            requireAuditVer(entity, request.getAuditVer());
            entity.setMaruDataName(name);
            entity.setDescription(trimToNull(request.getDescription()));
            entity.setCodePattern(codePattern);
            entity.setLvlCnt(lvlCnt);
            entity.setAttr01Name(labels[0]);
            entity.setAttr02Name(labels[1]);
            entity.setAttr03Name(labels[2]);
            entity.setAttr04Name(labels[3]);
            entity.setAttr05Name(labels[4]);
            entity.setAttr06Name(labels[5]);
            entity.setAttr07Name(labels[6]);
            entity.setAttr08Name(labels[7]);
            entity.setAttr09Name(labels[8]);
            entity.setAttr10Name(labels[9]);

            log.info("[dataEdit] save — id={} lvlCnt={}", id, lvlCnt);
            return buildView(entity);
        });
    }

    // ── action: delete(method=deprecate, 폐기) ─────────────────────────────────

    public DataEditView deprecate(DataEditDeprecateRequest request) {
        String id = requireMaruData(request == null ? null : request.getMaruDataId());
        return tx.execute(status -> {
            LockedMaruData locked = lock.lock(id); // R2
            checks.requireActive(locked); // R7 — 이미 DEPRECATED 면 재시도도 거부

            MdmData entity = dataRepo.findById(id).orElseThrow(DataEditService::noMaruData);
            requireAuditVer(entity, request.getAuditVer());
            entity.setStatus(LockedMaruData.DEPRECATED);

            log.info("[dataEdit] delete(deprecate) — id={}", id);
            return buildView(entity);
        });
    }

    // ── 공통 ────────────────────────────────────────────────────────────────

    /** R11·D6 — 줄일 칸(newLvlCnt+1..5)에 값이 있는 행이 하나도 없어야 한다. 스캔은 키별 마지막 행(닫힌 키 포함). */
    private void requireNoValueBeyond(String maruDataId, int newLvlCnt) {
        for (ItemSegmentRow row : rowStore.latestItemRows(maruDataId)) {
            for (int i = newLvlCnt + 1; i <= 5; i++) {
                if (row.value().lvl(i) != null) {
                    throw invalid("LVL" + i + " 에 값이 있는 코드가 있어 계층 칸 수를 " + newLvlCnt + " 로 줄일 수 없습니다");
                }
            }
        }
    }

    /**
     * 카테고리 요약 카드 — 닫힌 카테고리는 매칭 0(R5), TABLE 은 열린 소속 수, REGEX(BASE 포함)는 열린 항목 중 매칭 수
     * ({@link DataCategoryResolver#preview} 를 그대로 호출 — 재구현하지 않는다, B1 산출물). 키별 마지막 항목 행은 첫 REGEX
     * 카테고리에서 한 번만 읽고 나머지 카테고리는 그 목록으로 센다(카테고리마다 다시 읽지 않는다).
     */
    private List<CategorySummaryRow> categorySummaries(String maruDataId) {
        List<CategorySummaryRow> out = new ArrayList<>();
        List<ItemSegmentRow> latestItems = null;
        for (CateSegmentRow cate : rowStore.latestCateRows(maruDataId)) {
            DataCateValue v = cate.value();
            boolean open = cate.isOpen();
            int matchCount = 0;
            if (open) {
                if (DataCateValue.TABLE.equals(v.defKind())) {
                    matchCount = rowStore.openMemberCodes(maruDataId, cate.key().cateId()).size();
                } else {
                    if (latestItems == null) {
                        latestItems = rowStore.latestItemRows(maruDataId);
                    }
                    matchCount = DataCategoryResolver.preview(latestItems, v.defExpr(), v.defTarget()).count();
                }
            }
            out.add(new CategorySummaryRow(cate.key().cateId(), v.cateName(), v.defKind(), open, matchCount));
        }
        return out;
    }

    /**
     * {@code categorySummaries} 를 먼저 불러 그 안의 {@code rowStore} 네이티브 읽기가 하는 {@code entityManager.flush()}
     * 를 먼저 겪는다 — 그래야 {@code entity.getVersion()} 이 이번 트랜잭션에서 막 커밋 전 올린(flush 시점의
     * {@code @PreUpdate}) 값을 읽는다. 순서를 바꾸면(auditVer 를 먼저 읽으면) save·deprecate 응답의 auditVer 가
     * 갱신 전 값(예: 여전히 0)으로 나간다 — 저장 뒤 클라이언트가 그 값을 다음 요청의 auditVer 로 그대로 써야 하므로
     * (F9) 실제로 충돌 오탐을 일으킨다(HTTP 왕복 테스트 E1 로 처음 잡힘).
     */
    private DataEditView buildView(MdmData entity) {
        List<CategorySummaryRow> categories = categorySummaries(entity.getMaruDataId());

        DataEditView view = new DataEditView();
        view.setMaruDataId(entity.getMaruDataId());
        view.setMaruDataName(entity.getMaruDataName());
        view.setDescription(entity.getDescription());
        view.setCodePattern(entity.getCodePattern());
        view.setStatus(entity.getStatus());
        view.setSourceKind(entity.getSourceKind());
        view.setLvlCnt(entity.getLvlCnt());
        view.setAttr01Name(entity.getAttr01Name());
        view.setAttr02Name(entity.getAttr02Name());
        view.setAttr03Name(entity.getAttr03Name());
        view.setAttr04Name(entity.getAttr04Name());
        view.setAttr05Name(entity.getAttr05Name());
        view.setAttr06Name(entity.getAttr06Name());
        view.setAttr07Name(entity.getAttr07Name());
        view.setAttr08Name(entity.getAttr08Name());
        view.setAttr09Name(entity.getAttr09Name());
        view.setAttr10Name(entity.getAttr10Name());
        view.setAuditVer(entity.getVersion());
        view.setEditable(LockedMaruData.MDM.equals(entity.getSourceKind())
                && LockedMaruData.INUSE.equals(entity.getStatus()));
        view.setCategories(categories);
        view.setItemCount(rowStore.countOpenItems(entity.getMaruDataId()));
        return view;
    }

    static void requireAuditVer(MdmData entity, Long expected) {
        if (expected == null || !Objects.equals(expected, entity.getVersion())) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT); // F9
        }
    }

    private static RuntimeException noMaruData() {
        return invalid("없는 마루 데이터입니다");
    }

    private static String requireMaruData(String maruDataId) {
        String id = trimToNull(maruDataId);
        if (id == null) {
            throw invalid("마루 데이터를 고르세요");
        }
        return id;
    }

    private static String label(String value, int slot) {
        String v = trimToNull(value);
        if (v != null && v.length() > LABEL_MAX) {
            throw invalid("라벨 attr" + (slot < 10 ? "0" : "") + slot + " 은 " + LABEL_MAX + "자 이내여야 합니다");
        }
        return v;
    }

    private static RuntimeException invalid(String detail) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, detail, List.of());
    }

    private static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
