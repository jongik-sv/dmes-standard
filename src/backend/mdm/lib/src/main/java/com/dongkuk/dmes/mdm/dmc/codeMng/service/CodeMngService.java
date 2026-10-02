package com.dongkuk.dmes.mdm.dmc.codeMng.service;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.Header;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSegments;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.Summary;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.VerRow;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.security.MdmStewardGuard;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.category.MaruIdRules;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSourceKind;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.naming.NamingRules;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeMngRow;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeMngSearchRequest;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeMngSearchResult;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeRegRequest;
import com.dongkuk.dmes.mdm.dmc.codeMng.dto.CodeRegResult;
import com.dongkuk.dmes.mdm.entity.MdmCode;
import com.dongkuk.dmes.mdm.entity.MdmCodeVer;
import com.dongkuk.dmes.mdm.repository.MdmCodeRepository;
import com.dongkuk.dmes.mdm.repository.MdmDataRepository;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 마루 코드 조회·등록({@code codeMng}) OASIS 진입 서비스 — TSK-06-02 design.md §6.7.
 *
 * <p>정본: {@code docs/mdm/screens/codeMng/codeMng_기능설계서.md}. BPMN {@code services/dmc/codeMng.bpmn} 의
 * {@code actionGateway} 2 분기와 1:1 이다: {@code search→search}, {@code reg→register}.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — CGLIB 프록시가 파라미터명을 지워 OASIS 바인딩이
 * {@code ParameterName must not be null} 로 죽는다. 트랜잭션은 OASIS 프로세스가 건다 — 등록의 세 INSERT 는 그 한
 * 트랜잭션에서 함께 커밋되거나 함께 롤백된다(I7).
 */
@Service("codeMngService")
public class CodeMngService {

    private static final Logger log = LoggerFactory.getLogger(CodeMngService.class);

    static final int ID_MAX = 50;
    static final int NAME_MAX = 100;
    private static final Pattern FORBIDDEN = Pattern.compile(MaruIdRules.FORBIDDEN_CHAR_PATTERN);

    private final EntityManager entityManager;
    private final MdmCodeRepository codes;
    private final MdmDataRepository data;
    private final MasterCodeLedgerQueries ledger;
    private final MasterCodeVersionSegments segments;
    private final MdmStewardGuard stewardGuard;
    private final MdmCurrentUser currentUser;
    private final Clock clock;

    public CodeMngService(EntityManager entityManager, MdmCodeRepository codes, MdmDataRepository data,
                          MasterCodeLedgerQueries ledger, MasterCodeVersionSegments segments,
                          MdmStewardGuard stewardGuard, MdmCurrentUser currentUser, Clock clock) {
        this.entityManager = entityManager;
        this.codes = codes;
        this.data = data;
        this.ledger = ledger;
        this.segments = segments;
        this.stewardGuard = stewardGuard;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — 조회는 쓰지 않는다(I18)
    // ────────────────────────────────────────────────────────────────

    public CodeMngSearchResult search(CodeMngSearchRequest request) {
        String keyword = request == null ? null : trimToNull(request.getKeyword());
        String status = request == null ? null : trimToNull(request.getStatus());
        LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);

        List<Header> headers = ledger.headers(keyword);
        Map<String, List<VerRow>> versions = ledger.versions(headers.stream().map(Header::maruCodeId).toList());
        List<CodeMngRow> rows = new ArrayList<>();
        for (Header h : headers) {
            Summary s = MasterCodeVersionSummary.summarize(versions.getOrDefault(h.maruCodeId(), List.of()), h.status(), now);
            if (status != null && !status.equals(s.effectiveStatus())) {
                continue;
            }
            CodeMngRow row = new CodeMngRow();
            row.setMaruCodeId(h.maruCodeId());
            row.setMaruCodeName(h.maruCodeName());
            row.setSourceKind(h.sourceKind());
            row.setStatus(s.effectiveStatus());
            row.setStoredStatus(h.status());
            row.setCurrentVer(s.currentVer() == null ? null : s.currentVer().toPlainString());
            row.setCurrentVerLabel(s.currentVerLabel());
            row.setPending(s.pending());
            row.setUnappliedLabel(s.unappliedLabel());
            row.setUnappliedCount(s.unapplied().size());
            rows.add(row);
        }
        CodeMngSearchResult result = new CodeMngSearchResult();
        result.setRows(rows);
        result.setTotalCount(rows.size());
        log.info("[codeMng] search — keyword={} status={} rows={}", keyword, status, rows.size());
        return result;
    }

    // ────────────────────────────────────────────────────────────────
    // action: reg — 코드(CREATED) + VER 1.000 DRAFT(등록자 선점) + BASE 를 한 액션에서(I7)
    // ────────────────────────────────────────────────────────────────

    public CodeRegResult register(CodeRegRequest request) {
        stewardGuard.requireSteward(); // I12
        if (request == null) {
            throw invalid("등록할 값이 없습니다");
        }
        String id = trimToNull(request.getMaruCodeId());
        String name = trimToNull(request.getMaruCodeName());
        requireValidId(id);
        if (name == null || name.length() > NAME_MAX) {
            throw invalid("이름은 1~" + NAME_MAX + "자여야 합니다");
        }
        int lvlCnt = request.getLvlCnt() == null ? MasterCodeConventions.LVL_CNT_DEFAULT : request.getLvlCnt();
        if (lvlCnt < MasterCodeConventions.LVL_CNT_MIN || lvlCnt > MasterCodeConventions.LVL_CNT_MAX) {
            throw invalid("계층 칸 수는 " + MasterCodeConventions.LVL_CNT_MIN + "~" + MasterCodeConventions.LVL_CNT_MAX
                    + " 이어야 합니다");
        }
        String sourceKind = trimToNull(request.getSourceKind());
        if (sourceKind != null && !MasterCodeSourceKind.MDM.name().equals(sourceKind)) {
            throw invalid("등록은 MDM 원천만 받습니다"); // I8
        }
        if (codes.existsById(id) || data.existsById(id)) {
            throw MdmErrors.of(MdmErrorCode.MARU_ID_NAMESPACE_CONFLICT); // I10
        }

        String userId = currentUser.userId();
        MdmCode code = new MdmCode(id, name, MasterCodeSourceKind.MDM.name());
        code.setDescription(trimToNull(request.getDescription()));
        code.setLvlCnt(lvlCnt);
        entityManager.persist(code);

        MdmCodeVer ver = new MdmCodeVer(id, MasterCodeConventions.FIRST_VER, VersionKind.MAJOR.name());
        ver.setOwnerId(userId); // I11 — 클라이언트 값이 아니라 요청 사용자
        entityManager.persist(ver);
        entityManager.flush();

        segments.createBaseCategory(new VersionRef(VersionTarget.MASTER_CODE, id, MasterCodeConventions.FIRST_VER));

        CodeRegResult result = new CodeRegResult();
        result.setMaruCodeId(id);
        result.setVer(MasterCodeConventions.FIRST_VER.toPlainString());
        result.setRowVersion(ver.getRowVersion());
        result.setOwnerId(userId);
        log.info("[codeMng] reg — id={} owner={}", id, userId);
        return result;
    }

    /** I9 — 컬럼 물리명 규칙(대문자 스네이크) + 1~50자 + 마루 ID 금지 문자(점·콤마·공백) 없음(D8). */
    static void requireValidId(String id) {
        if (id == null || id.length() > ID_MAX) {
            throw invalid("마루 코드 ID 는 1~" + ID_MAX + "자여야 합니다");
        }
        if (FORBIDDEN.matcher(id).find()) {
            throw invalid("마루 코드 ID 에 점·콤마·공백을 쓸 수 없습니다");
        }
        if (!NamingRules.STD_PHYS_NAME.matcher(id).matches()) {
            throw invalid("마루 코드 ID 는 영문 대문자로 시작하고 영문 대문자·숫자·_ 만 쓸 수 있습니다");
        }
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
