package com.dongkuk.dmes.mdm.dme.ruleSetMng.service;

import static com.dongkuk.dmes.mdm.common.support.MdmStrings.blankToNull;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIoReader;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer.ResultRow;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer.SetIo;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmTextLimits;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetListRow;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetRegRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetRegResult;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetSearchResult;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetVerRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 룰 세트 조회·등록({@code ruleSetMng}) OASIS 진입 서비스 — TSK-08-06 design §6.7. BPMN {@code services/dme/ruleSetMng.bpmn} 의
 * {@code search}(method {@link #search})·{@code reg}(method {@link #register}) 두 분기와 1:1.
 *
 * <p>목록의 계산 칸(최종 결과 변수·입력 변수 수·거부·경고 수)은 저장하지 않는 값이다 — 멤버 룰의 지금 RELEASED 입출력({@link RuleIoReader},
 * I7)으로 {@link RuleSetAnalyzer} 가 세트 편집 화면·저장 검사와 같은 알고리즘으로 계산한다. 세트는 작아서 전부 읽어 메모리에서 거른다.
 * 멤버 룰은 세트마다 "표시 버전"(지금 적용 중인 RELEASED, 없으면 VER 최대 — J11)의 것이고 행에 그 버전({@code ver})을 싣는다. 상태는 부모
 * 계산 상태(CREATED 이면서 적용된 RELEASED 가 있으면 INUSE)다. 등록은 부모 CREATED + 1.000 MAJOR DRAFT(등록자 소유, D-144 2단계 J12)다.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — OASIS 파라미터 이름 바인딩이 깨진다. 쓰기는 {@link TransactionTemplate}.
 * 담당자 역할 판단은 {@link RuleStewardCheck} 한 곳으로만 한다(I19).
 */
@Service("ruleSetMngService")
public class RuleSetMngService {

    static final int DEFAULT_SIZE = 20;
    static final int MAX_SIZE = 100;
    static final int NAME_MAX = 100;
    static final String DEPRECATED = "DEPRECATED";

    private final MdmRuleSetRepository setRepository;
    private final RuleQueries queries;
    private final RuleIoReader ioReader;
    private final RuleStewardCheck stewardCheck;
    private final RuleSetVersionQueries setVersions;
    private final MdmRuleSetVerRepository verRepository;
    private final MdmCurrentUser currentUser;
    private final Clock clock;
    private final TransactionTemplate tx;

    public RuleSetMngService(MdmRuleSetRepository setRepository, RuleQueries queries, RuleIoReader ioReader,
                             RuleStewardCheck stewardCheck, RuleSetVersionQueries setVersions, MdmRuleSetVerRepository verRepository,
                             MdmCurrentUser currentUser, Clock clock, PlatformTransactionManager transactionManager) {
        this.currentUser = currentUser;
        this.setVersions = setVersions;
        this.verRepository = verRepository;
        this.clock = clock;
        this.setRepository = setRepository;
        this.queries = queries;
        this.ioReader = ioReader;
        this.stewardCheck = stewardCheck;
        this.tx = new TransactionTemplate(transactionManager);
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — 조건 넷(세트·담은 룰·결과 변수·상태)과 서버 페이징
    // ────────────────────────────────────────────────────────────────

    public RuleSetSearchResult search(RuleSetSearchRequest request) {
        RuleSetSearchRequest r = request != null ? request : new RuleSetSearchRequest();
        int page = r.getPage() == null || r.getPage() < 0 ? 0 : r.getPage();
        int size = r.getSize() == null || r.getSize() < 1 ? DEFAULT_SIZE : Math.min(r.getSize(), MAX_SIZE);
        String keyword = blankToNull(r.getKeyword());
        String keywordUpper = upper(keyword);
        String ruleUpper = upper(blankToNull(r.getRuleId()));
        String resultVarUpper = upper(blankToNull(r.getResultVar()));
        String status = blankToNull(r.getStatus());

        // 1) 입출력이 필요 없는 조건으로 먼저 거른다. 멤버 룰은 세트마다 표시 버전(J11)의 RULE_IDS 다 — 세트 버전은 한 번에 읽는다.
        //    상태 조건은 계산 상태로 본다(CREATED 이면서 적용된 RELEASED 가 있으면 INUSE — 룰 목록과 같다).
        List<MdmRuleSet> sets = queries.allSets();
        Map<String, List<MdmRuleSetVer>> byId = setVersions.versionsOf(sets.stream().map(MdmRuleSet::getMaruRuleSetId).toList());
        LocalDateTime now = LocalDateTime.now(clock);
        List<MdmRuleSet> candidates = new ArrayList<>();
        Map<String, List<String>> members = new LinkedHashMap<>();
        Map<String, String> statuses = new LinkedHashMap<>();
        Map<String, String> shownVers = new LinkedHashMap<>();
        for (MdmRuleSet s : sets) {
            List<MdmRuleSetVer> versions = byId.get(s.getMaruRuleSetId());
            String effective = RuleVersions.effectiveStatus(s.getStatus(), versions, now);
            if (status != null && !status.equals(effective)) {
                continue;
            }
            if (keyword != null && !s.getMaruRuleSetId().toUpperCase(Locale.ROOT).contains(keywordUpper)
                    && (s.getMaruRuleSetName() == null || !s.getMaruRuleSetName().contains(keyword))) {
                continue;
            }
            Optional<MdmRuleSetVer> shown = RuleSetVersionQueries.display(versions, now);
            List<String> ids = shown.map(RuleSetVersionQueries::members).orElse(List.of());
            if (ruleUpper != null && ids.stream().noneMatch(id -> id.toUpperCase(Locale.ROOT).contains(ruleUpper))) {
                continue;
            }
            candidates.add(s);
            members.put(s.getMaruRuleSetId(), ids);
            statuses.put(s.getMaruRuleSetId(), effective);
            shownVers.put(s.getMaruRuleSetId(), shown.map(v -> VersionNumbers.plain(v.getVer())).orElse(null));
        }

        // 2) 남은 세트의 멤버 룰 입출력을 한 번에 읽고 결과 변수 조건(중간 결과 포함, 정확 일치)으로 거른다.
        Set<String> memberIds = new LinkedHashSet<>();
        members.values().forEach(memberIds::addAll);
        Map<String, RuleIo> io = ioReader.read(memberIds);
        List<MdmRuleSet> filtered = new ArrayList<>();
        for (MdmRuleSet s : candidates) {
            if (resultVarUpper == null || produces(members.get(s.getMaruRuleSetId()), io, resultVarUpper)) {
                filtered.add(s);
            }
        }

        // 3) 세트 ID 순(allSets 순서) 그대로 자르고 그 페이지 행만 계산한다.
        int from = (int) Math.min((long) page * size, filtered.size());
        int to = Math.min(from + size, filtered.size());
        List<RuleSetListRow> rows = new ArrayList<>(to - from);
        for (MdmRuleSet s : filtered.subList(from, to)) {
            String id = s.getMaruRuleSetId();
            rows.add(toRow(s, statuses.get(id), shownVers.get(id), members.get(id), io));
        }
        return new RuleSetSearchResult(rows, filtered.size());
    }

    private static boolean produces(List<String> ids, Map<String, RuleIo> io, String nameUpper) {
        for (String id : ids) {
            RuleIo rule = io.get(id);
            if (rule != null && rule.results().stream().anyMatch(x -> x.name().toUpperCase(Locale.ROOT).equals(nameUpper))) {
                return true;
            }
        }
        return false;
    }

    /** {@code status} 는 계산 상태, {@code ver} 는 표시 버전(없으면 null). */
    private static RuleSetListRow toRow(MdmRuleSet s, String status, String ver, List<String> ids, Map<String, RuleIo> io) {
        SetIo setIo = RuleSetAnalyzer.io(ids, io);
        RuleSetListRow row = new RuleSetListRow();
        row.setSetId(s.getMaruRuleSetId());
        row.setSetName(s.getMaruRuleSetName());
        row.setDescription(s.getDescription());
        row.setStatus(status);
        row.setVer(ver);
        row.setRuleCount(ids.size());
        row.setFinalResults(setIo.results().stream().filter(ResultRow::finalResult).map(ResultRow::name).toList());
        row.setInputCount(setIo.inputs().size());
        if (!DEPRECATED.equals(status)) {
            List<RuleSetCheck> checks = RuleSetAnalyzer.checks(ids, io);
            int rejects = (int) checks.stream().filter(RuleSetCheck::rejected).count();
            row.setRejectCount(rejects);
            row.setWarnCount(checks.size() - rejects);
        }
        return row;
    }

    // ────────────────────────────────────────────────────────────────
    // action: reg — 빈 세트 등록(I1·I2) — 부모 CREATED + 1.000 MAJOR DRAFT(등록자 소유, D-144 2단계)
    // ────────────────────────────────────────────────────────────────

    /**
     * 부모(CREATED) + 1.000 MAJOR DRAFT(룰 없음 {@code []}, row_version 0, 소유자 = 등록자 — 룰 등록의 "VER 1 DRAFT 자동 선점"과 같다, J12).
     * 룰은 세트 편집 화면에서 그 DRAFT 에 담고 확정해야 사용 중(INUSE)이 된다.
     */
    public RuleSetRegResult register(RuleSetRegRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "등록할 값이 없습니다.");
        }
        String id = request.getSetId();
        RuleSetIdRules.validate(id);
        String name = blankToNull(request.getSetName());
        if (name == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "세트명은 필수입니다.");
        }
        if (name.length() > NAME_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "세트명은 " + NAME_MAX + "자 이하여야 합니다.");
        }
        // DESCRIPTION 은 VARCHAR2(4000 BYTE) 칸 — UTF-8 바이트로 막는다(ORA-12899 예방)
        if (MdmTextLimits.overBytes(blankToNull(request.getDescription()))) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "설명은 " + MdmTextLimits.TEXT_BYTES_MAX + "바이트(한글 약 1,333자)를 넘을 수 없습니다.");
        }
        stewardCheck.requireSteward();
        if (setRepository.existsById(id)) {
            throw new BusinessException(ErrorCode.DUPLICATE_DATA, "이미 있는 룰 세트 ID 입니다: " + id);
        }
        String me = currentUser.userId();
        tx.executeWithoutResult(status -> {
            MdmRuleSet set = new MdmRuleSet(id, name);            // CREATED
            set.setDescription(blankToNull(request.getDescription()));
            setRepository.saveAndFlush(set);
            verRepository.saveAndFlush(new MdmRuleSetVer(id, VersionNumbers.FIRST, VersionKind.MAJOR, me, "[]")); // 1.000 DRAFT, 등록자 소유(J12)
        });
        return new RuleSetRegResult(id, 0L, VersionNumbers.plain(VersionNumbers.FIRST));
    }

    private static String upper(String s) {
        return s == null ? null : s.toUpperCase(Locale.ROOT);
    }
}
