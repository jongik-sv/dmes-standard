package com.dongkuk.dmes.mdm.dmd.dataMng.service;

import static com.dongkuk.dmes.mdm.common.support.MdmStrings.trimToNull;
import static com.dongkuk.dmes.mdm.common.support.MdmErrors.invalid;

import com.dongkuk.dmes.mdm.common.segment.DataCategorySegmentCore;
import com.dongkuk.dmes.mdm.common.segment.DataCateValue;
import com.dongkuk.dmes.mdm.common.segment.LockedMaruData;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.category.CategoryConventions;
import com.dongkuk.dmes.mdm.contract.category.CategoryOwner;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.category.MaruIdRules;
import com.dongkuk.dmes.mdm.dma.naming.NamingRules;
import com.dongkuk.dmes.mdm.dmd.dataMng.dto.DataMngRegRequest;
import com.dongkuk.dmes.mdm.dmd.dataMng.dto.DataMngRegResult;
import com.dongkuk.dmes.mdm.dmd.dataMng.dto.DataMngRow;
import com.dongkuk.dmes.mdm.dmd.dataMng.dto.DataMngSearchRequest;
import com.dongkuk.dmes.mdm.dmd.dataMng.dto.DataMngSearchResult;
import com.dongkuk.dmes.mdm.entity.MdmData;
import com.dongkuk.dmes.mdm.repository.MdmCodeRepository;
import com.dongkuk.dmes.mdm.repository.MdmDataRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 마루 데이터 조회·등록({@code dataMng}) OASIS 진입 서비스 — design.md §1·§2. BPMN {@code services/dmd/dataMng.bpmn} 의
 * 분기와 1:1 이다: {@code search→search}, {@code reg→register}.
 *
 * <p>등록은 {@code TB_MDM_DATA}(INUSE)와 BASE 카테고리를 한 트랜잭션으로 만든다(R1, F6·F7·F8) — 이 서비스가 직접 쥔
 * {@link TransactionTemplate} 이 {@link DataCategorySegmentCore#registerCate} 의 자기 트랜잭션과 합류(join, 기본
 * 전파 REQUIRED)한다. OASIS 앰비언트 트랜잭션에 기대지 않는다(F7).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — CGLIB 프록시가 파라미터명을 지워 OASIS 바인딩이
 * {@code ParameterName must not be null} 로 죽는다(F11·F18).
 */
@Service("dataMngService")
public class DataMngService {

    private static final Logger log = LoggerFactory.getLogger(DataMngService.class);

    static final int ID_MAX = 50;
    static final int NAME_MAX = 100;
    private static final Pattern FORBIDDEN = Pattern.compile(MaruIdRules.FORBIDDEN_CHAR_PATTERN);

    private final EntityManager entityManager;
    private final MdmDataRepository dataRepo;
    private final MdmCodeRepository codeRepo;
    private final DataCategorySegmentCore categorySegmentCore;
    private final TransactionTemplate tx;

    public DataMngService(EntityManager entityManager, MdmDataRepository dataRepo, MdmCodeRepository codeRepo,
                          DataCategorySegmentCore categorySegmentCore, PlatformTransactionManager transactionManager) {
        this.entityManager = entityManager;
        this.dataRepo = dataRepo;
        this.codeRepo = codeRepo;
        this.categorySegmentCore = categorySegmentCore;
        this.tx = new TransactionTemplate(transactionManager);
    }

    // ── action: search ──────────────────────────────────────────────────────

    public DataMngSearchResult search(DataMngSearchRequest request) {
        String id = trimToNull(request == null ? null : request.getMaruDataId());
        String name = trimToNull(request == null ? null : request.getMaruDataName());
        String status = trimToNull(request == null ? null : request.getStatus());

        StringBuilder jpql = new StringBuilder("SELECT d FROM MdmData d WHERE 1=1");
        Map<String, Object> params = new LinkedHashMap<>();
        if (id != null) {
            jpql.append(" AND UPPER(d.maruDataId) LIKE :id ESCAPE '\\'");
            params.put("id", "%" + escapeLike(id.toUpperCase(Locale.ROOT)) + "%");
        }
        if (name != null) {
            jpql.append(" AND d.maruDataName LIKE :name ESCAPE '\\'");
            params.put("name", "%" + escapeLike(name) + "%");
        }
        if (status != null) {
            jpql.append(" AND d.status = :status");
            params.put("status", status);
        }
        jpql.append(" ORDER BY d.maruDataId");

        TypedQuery<MdmData> query = entityManager.createQuery(jpql.toString(), MdmData.class);
        params.forEach(query::setParameter);
        List<DataMngRow> rows = query.getResultList().stream()
                .map(d -> new DataMngRow(d.getMaruDataId(), d.getMaruDataName(), d.getSourceKind(), d.getStatus()))
                .toList();
        log.info("[dataMng] search — id={} name={} status={} count={}", id, name, status, rows.size());
        return new DataMngSearchResult(rows);
    }

    // ── action: reg ──────────────────────────────────────────────────────────

    /** 등록 — MDM 원천만(R10). ID 는 마루 코드·마루 데이터와 한 이름 공간이다(F15, MDM011). */
    public DataMngRegResult register(DataMngRegRequest request) {
        if (request == null) {
            throw invalid("등록할 값이 없습니다");
        }
        String id = trimToNull(request.getMaruDataId());
        String name = trimToNull(request.getMaruDataName());
        requireValidId(id);
        if (name == null || name.length() > NAME_MAX) {
            throw invalid("이름은 1~" + NAME_MAX + "자여야 합니다");
        }
        String codePattern = trimToNull(request.getCodePattern());
        if (codePattern == null) {
            throw invalid("키 패턴을 입력하세요");
        }
        int lvlCnt = request.getLvlCnt() == null ? 0 : request.getLvlCnt();
        if (lvlCnt < 0 || lvlCnt > 5) {
            throw invalid("계층 칸 수는 0~5 이어야 합니다");
        }
        if (dataRepo.existsById(id) || codeRepo.existsById(id)) {
            throw MdmErrors.of(MdmErrorCode.MARU_ID_NAMESPACE_CONFLICT); // F15
        }

        return tx.execute(status -> {
            MdmData entity = new MdmData(id, name, LockedMaruData.INUSE, LockedMaruData.MDM, codePattern);
            entity.setDescription(trimToNull(request.getDescription()));
            entity.setLvlCnt(lvlCnt);
            dataRepo.save(entity);

            // BASE — REGEX ".*" 대상 KEY, 이름 "전체"(R6, D4, F16). registerCate 의 lock() 이 위 save() 를 flush 해 본다(F8).
            DataCateValue base = new DataCateValue("전체", CategoryConventions.BASE_DEF_KIND.name(),
                    CategoryConventions.BASE_DEF_EXPR, CategoryOwner.MASTER_DATA.baseDefTarget().name(), null);
            categorySegmentCore.registerCate(id, CategoryConventions.BASE_CATE_ID, base);

            log.info("[dataMng] reg — id={}", id);
            return new DataMngRegResult(id);
        });
    }

    // ── 공통 ────────────────────────────────────────────────────────────────

    /** F15 대칭 — 04 {@code CodeMngService.requireValidId} 와 같은 규칙(마루 ID 금지 문자·물리명 규칙). */
    static void requireValidId(String id) {
        if (id == null || id.length() > ID_MAX) {
            throw invalid("마루 데이터 ID 는 1~" + ID_MAX + "자여야 합니다");
        }
        if (FORBIDDEN.matcher(id).find()) {
            throw invalid("마루 데이터 ID 에 점·콤마·공백을 쓸 수 없습니다");
        }
        if (!NamingRules.STD_PHYS_NAME.matcher(id).matches()) {
            throw invalid("마루 데이터 ID 는 영문 대문자로 시작하고 영문 대문자·숫자·_ 만 쓸 수 있습니다");
        }
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
