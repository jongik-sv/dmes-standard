package com.dongkuk.dmes.mdm.dmc.codeEdit.service;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeLedgerQueries.Header;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionNumbers;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.Summary;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.VerRow;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.security.MdmStewardGuard;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSourceKind;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.MaruObjectStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeDeprecateRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditFlags;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditSearchRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditView;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeEditViewRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeHeaderSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeHeaderView;
import com.dongkuk.dmes.mdm.dmc.codeEdit.dto.CodeVersionRow;
import com.dongkuk.dmes.mdm.entity.MdmCode;
import com.dongkuk.dmes.mdm.repository.MdmCodeRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 마루 코드 수정({@code codeEdit}) OASIS 진입 서비스 — TSK-06-02 design.md §6.8.
 *
 * <p>정본: {@code docs/mdm/screens/codeEdit/codeEdit_기능설계서.md}. BPMN {@code services/dmc/codeEdit.bpmn} 의
 * {@code actionGateway} 분기와 1:1 이다(design §6.1 표).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — 트랜잭션은 OASIS 프로세스가 건다. 모든 쓰기 액션은 첫 줄에서
 * 담당자 가드를 부른다(I12). TB_MDM_CODE 쓰기는 {@link MdmCode} 엔티티 경로 하나로 한다(네이티브 UPDATE 와 섞으면 flush 때
 * 옛 감사 카운터로 덮어쓴다). 응답은 flush 뒤 네이티브 조회 모델로 만든다(I23).
 */
@Service("codeEditService")
public class CodeEditService {

    private static final Logger log = LoggerFactory.getLogger(CodeEditService.class);

    static final int NAME_MAX = 100;
    static final int LABEL_MAX = 100;
    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final MdmCodeRepository codes;
    private final MasterCodeLedgerQueries ledger;
    private final MdmStewardGuard stewardGuard;
    private final MdmCurrentUser currentUser;
    private final Clock clock;

    public CodeEditService(MdmCodeRepository codes, MasterCodeLedgerQueries ledger, MdmStewardGuard stewardGuard,
                           MdmCurrentUser currentUser, Clock clock) {
        this.codes = codes;
        this.ledger = ledger;
        this.stewardGuard = stewardGuard;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — 코드 선택 콤보 데이터
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> searchCodes(CodeEditSearchRequest request) {
        String keyword = request == null ? null : trimToNull(request.getKeyword());
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Header h : ledger.headers(keyword)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("maruCodeId", h.maruCodeId());
            row.put("maruCodeName", h.maruCodeName());
            row.put("status", h.status());
            rows.add(row);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows);
        return result;
    }

    // ────────────────────────────────────────────────────────────────
    // action: view
    // ────────────────────────────────────────────────────────────────

    public CodeEditView view(CodeEditViewRequest request) {
        String id = request == null ? null : trimToNull(request.getMaruCodeId());
        if (id == null) {
            throw invalid("마루 코드를 고르세요");
        }
        return buildView(id);
    }

    // ────────────────────────────────────────────────────────────────
    // action: save(method=saveHeader) — 헤더 경미 수정(I19)
    // ────────────────────────────────────────────────────────────────

    public CodeEditView saveHeader(CodeHeaderSaveRequest request) {
        MdmCode code = requireWritable(request == null ? null : request.getMaruCodeId());
        Summary summary = summary(code);
        if (summary.unapplied().size() >= 2) {
            throw MdmErrors.of(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS); // I6
        }
        requireAuditVer(code, request.getAuditVer());

        String name = trimToNull(request.getMaruCodeName());
        if (name == null || name.length() > NAME_MAX) {
            throw invalid("이름은 1~" + NAME_MAX + "자여야 합니다");
        }
        int lvlCnt = request.getLvlCnt() == null ? code.getLvlCnt() : request.getLvlCnt();
        if (lvlCnt < MasterCodeConventions.LVL_CNT_MIN || lvlCnt > MasterCodeConventions.LVL_CNT_MAX) {
            throw invalid("계층 칸 수는 " + MasterCodeConventions.LVL_CNT_MIN + "~" + MasterCodeConventions.LVL_CNT_MAX
                    + " 이어야 합니다");
        }
        String[] labels = {
            label(request.getAttr01Name(), 1), label(request.getAttr02Name(), 2), label(request.getAttr03Name(), 3),
            label(request.getAttr04Name(), 4), label(request.getAttr05Name(), 5), label(request.getAttr06Name(), 6),
            label(request.getAttr07Name(), 7), label(request.getAttr08Name(), 8), label(request.getAttr09Name(), 9),
            label(request.getAttr10Name(), 10)};
        if (lvlCnt < code.getLvlCnt()) {
            // 줄이기 — 현재 적용 버전보다 뒤에 닫히는(열린 행 포함) 코드 행이 뒤 칸에 값을 가지면 거부한다.
            int used = ledger.maxLvlInUse(code.getMaruCodeId(), summary.currentAppliedVer());
            if (used > lvlCnt) {
                throw invalid("LVL" + used + " 에 값이 있는 코드가 있어 계층 칸 수를 " + lvlCnt + " 로 줄일 수 없습니다");
            }
        }

        code.setMaruCodeName(name);
        code.setDescription(trimToNull(request.getDescription()));
        code.setLvlCnt(lvlCnt);
        code.setAttr01Name(labels[0]);
        code.setAttr02Name(labels[1]);
        code.setAttr03Name(labels[2]);
        code.setAttr04Name(labels[3]);
        code.setAttr05Name(labels[4]);
        code.setAttr06Name(labels[5]);
        code.setAttr07Name(labels[6]);
        code.setAttr08Name(labels[7]);
        code.setAttr09Name(labels[8]);
        code.setAttr10Name(labels[9]);
        markInUseIfApplied(code, summary); // I18
        log.info("[codeEdit] save — id={} lvlCnt={}", code.getMaruCodeId(), lvlCnt);
        return buildView(code.getMaruCodeId());
    }

    // ────────────────────────────────────────────────────────────────
    // action: execute(method=deprecate) — DEPRECATED 전이(I13)
    // ────────────────────────────────────────────────────────────────

    public CodeEditView deprecate(CodeDeprecateRequest request) {
        MdmCode code = requireWritable(request == null ? null : request.getMaruCodeId());
        if (MaruObjectStatus.DEPRECATED.name().equals(code.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "이미 폐기된 마루 코드입니다", List.of());
        }
        int unapplied = summary(code).unapplied().size();
        if (unapplied >= 2) {
            throw MdmErrors.of(MdmErrorCode.MULTIPLE_UNAPPLIED_VERSIONS);
        }
        if (unapplied == 1) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "미적용 버전이 있어 폐기할 수 없습니다", List.of());
        }
        requireAuditVer(code, request.getAuditVer());
        // 행(VER·ITEM·CATE)은 지우지 않는다 — 과거 기준일 판정이 계속된다(04 「코드 삭제와 마루 코드 폐기」).
        code.setStatus(MaruObjectStatus.DEPRECATED.name());
        log.info("[codeEdit] execute(deprecate) — id={}", code.getMaruCodeId());
        return buildView(code.getMaruCodeId());
    }

    // ── 공통 ──

    /** 쓰기 공통 머리: 담당자 가드(I12) → 코드 로드(없으면 MDM021) → 원천 MDM(I8). */
    MdmCode requireWritable(String maruCodeId) {
        stewardGuard.requireSteward();
        String id = trimToNull(maruCodeId);
        MdmCode code = id == null ? null : codes.findById(id).orElse(null);
        if (code == null) {
            throw invalid("마루 코드가 없습니다");
        }
        if (!MasterCodeSourceKind.MDM.name().equals(code.getSourceKind())) {
            throw invalid("원천이 MDM 이 아닌 마루 코드는 이 화면에서 고칠 수 없습니다");
        }
        return code;
    }

    Summary summary(MdmCode code) {
        return MasterCodeVersionSummary.summarize(ledger.versions(code.getMaruCodeId()), code.getStatus(), now());
    }

    /** 저장 CREATED 이고 적용된 RELEASED 가 있으면 같은 트랜잭션에서 INUSE 로 저장한다(I18, ADR-0002 D6). */
    static void markInUseIfApplied(MdmCode code, Summary summary) {
        if (MaruObjectStatus.CREATED.name().equals(code.getStatus())
                && MaruObjectStatus.INUSE.name().equals(summary.effectiveStatus())) {
            code.setStatus(MaruObjectStatus.INUSE.name());
        }
    }

    CodeEditView buildView(String id) {
        Header h = ledger.header(id).orElseThrow(() -> invalid("마루 코드가 없습니다"));
        List<VerRow> versions = ledger.versions(id);
        Summary s = MasterCodeVersionSummary.summarize(versions, h.status(), now());
        boolean steward = currentUser.roleIds().contains(MdmRoles.STEWARD);
        boolean sourceMdm = MasterCodeSourceKind.MDM.name().equals(h.sourceKind());
        boolean deprecated = MaruObjectStatus.DEPRECATED.name().equals(h.status());

        CodeHeaderView header = new CodeHeaderView();
        header.setMaruCodeId(h.maruCodeId());
        header.setMaruCodeName(h.maruCodeName());
        header.setDescription(h.description());
        header.setLvlCnt(h.lvlCnt());
        header.setSourceKind(h.sourceKind());
        header.setStatus(s.effectiveStatus());
        header.setStoredStatus(h.status());
        header.setAuditVer(h.auditVer());
        List<String> a = h.attrNames();
        header.setAttr01Name(a.get(0));
        header.setAttr02Name(a.get(1));
        header.setAttr03Name(a.get(2));
        header.setAttr04Name(a.get(3));
        header.setAttr05Name(a.get(4));
        header.setAttr06Name(a.get(5));
        header.setAttr07Name(a.get(6));
        header.setAttr08Name(a.get(7));
        header.setAttr09Name(a.get(8));
        header.setAttr10Name(a.get(9));
        header.setCurrentVerLabel(s.currentVerLabel());
        header.setUnappliedLabel(s.unappliedLabel());

        List<CodeVersionRow> rows = new ArrayList<>(versions.size());
        List<String> restoreSources = new ArrayList<>();
        for (VerRow v : versions) {
            CodeVersionRow row = new CodeVersionRow();
            row.setVer(v.ver().toPlainString());
            row.setVerLabel(MasterCodeVersionNumbers.label(v.ver()));
            row.setVerKind(v.verKind());
            row.setStatus(v.status());
            row.setOwnerId(v.ownerId());
            row.setApplyFrom(text(v.applyFrom()));
            row.setApplyTo(text(v.applyTo()));
            row.setReleasedAt(text(v.releasedAt()));
            row.setRestoredFrom(v.restoredFrom() == null ? null : v.restoredFrom().toPlainString());
            row.setRestoredLabel(v.restoredFrom() == null ? null : MasterCodeVersionNumbers.label(v.restoredFrom()) + " 복원");
            row.setRowVersion(v.rowVersion());
            row.setUnapplied(s.unapplied().contains(v));
            row.setDescription(v.description());
            rows.add(row);
            if (VersionStatus.RELEASED.name().equals(v.status())) {
                restoreSources.add(v.ver().toPlainString()); // D13 — RELEASED 만, ver 내림차순
            }
        }

        BigDecimal max = s.maxVer();
        boolean open = s.unapplied().isEmpty() && !deprecated && sourceMdm;
        CodeEditFlags flags = new CodeEditFlags();
        flags.setUnappliedCount(s.unapplied().size());
        flags.setCanNewMajor(open && MasterCodeVersionNumbers.canMajor(max));
        flags.setCanNewMinor(open && MasterCodeVersionNumbers.canMinor(max));
        flags.setNextMajor(MasterCodeVersionNumbers.nextMajor(max).toPlainString());
        flags.setNextMinor(MasterCodeVersionNumbers.canMinor(max) ? MasterCodeVersionNumbers.nextMinor(max).toPlainString() : null);
        flags.setMinorLimit(max != null && !MasterCodeVersionNumbers.canMinor(max));
        flags.setCanDeprecate(!deprecated && s.unapplied().isEmpty() && sourceMdm);
        flags.setEditable(sourceMdm && steward);

        CodeEditView view = new CodeEditView();
        view.setHeader(header);
        view.setVersions(rows);
        view.setFlags(flags);
        view.setRestoreSources(restoreSources);
        view.setMe(currentUser.userId());
        view.setSteward(steward);
        return view;
    }

    static void requireAuditVer(MdmCode code, Long expected) {
        if (expected == null || !Objects.equals(expected, code.getVersion())) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT); // I19
        }
    }

    LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    private static String label(String value, int slot) {
        String v = trimToNull(value);
        if (v != null && v.length() > LABEL_MAX) {
            throw invalid("라벨 attr" + (slot < 10 ? "0" : "") + slot + " 은 " + LABEL_MAX + "자 이내여야 합니다");
        }
        return v;
    }

    private static String text(LocalDateTime value) {
        return value == null ? null : TEXT.format(value);
    }

    static RuntimeException invalid(String detail) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, detail, List.of());
    }

    static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
