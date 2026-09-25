package com.dongkuk.dmes.mdm.dme.ruleSetMng.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIoReader;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer.ResultRow;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer.SetIo;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetListRow;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetRegRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetRegResult;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetMng.dto.RuleSetSearchResult;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
    private final TransactionTemplate tx;

    public RuleSetMngService(MdmRuleSetRepository setRepository, RuleQueries queries, RuleIoReader ioReader,
                             RuleStewardCheck stewardCheck, PlatformTransactionManager transactionManager) {
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

        // 1) 입출력이 필요 없는 조건으로 먼저 거른다.
        List<MdmRuleSet> candidates = new ArrayList<>();
        Map<String, List<String>> members = new LinkedHashMap<>();
        for (MdmRuleSet s : queries.allSets()) {
            if (status != null && !status.equals(s.getStatus())) {
                continue;
            }
            if (keyword != null && !s.getMaruRuleSetId().toUpperCase(Locale.ROOT).contains(keywordUpper)
                    && (s.getMaruRuleSetName() == null || !s.getMaruRuleSetName().contains(keyword))) {
                continue;
            }
            List<String> ids = ruleIdsOf(s.getRuleIds());
            if (ruleUpper != null && ids.stream().noneMatch(id -> id.toUpperCase(Locale.ROOT).contains(ruleUpper))) {
                continue;
            }
            candidates.add(s);
            members.put(s.getMaruRuleSetId(), ids);
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
            rows.add(toRow(s, members.get(s.getMaruRuleSetId()), io));
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

    private static RuleSetListRow toRow(MdmRuleSet s, List<String> ids, Map<String, RuleIo> io) {
        SetIo setIo = RuleSetAnalyzer.io(ids, io);
        RuleSetListRow row = new RuleSetListRow();
        row.setSetId(s.getMaruRuleSetId());
        row.setSetName(s.getMaruRuleSetName());
        row.setDescription(s.getDescription());
        row.setStatus(s.getStatus());
        row.setRuleCount(ids.size());
        row.setFinalResults(setIo.results().stream().filter(ResultRow::finalResult).map(ResultRow::name).toList());
        row.setInputCount(setIo.inputs().size());
        if (!DEPRECATED.equals(s.getStatus())) {
            List<RuleSetCheck> checks = RuleSetAnalyzer.checks(ids, io);
            int rejects = (int) checks.stream().filter(RuleSetCheck::rejected).count();
            row.setRejectCount(rejects);
            row.setWarnCount(checks.size() - rejects);
        }
        return row;
    }

    // ────────────────────────────────────────────────────────────────
    // action: reg — 빈 세트 등록(I1·I2)
    // ────────────────────────────────────────────────────────────────

    /** TB_MDM_RULE_SET 한 행(INUSE, 룰 없음 {@code []}, row_version 0)만 쓴다. 룰은 세트 편집 화면에서 담는다. */
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
        stewardCheck.requireSteward();
        if (setRepository.existsById(id)) {
            throw new BusinessException(ErrorCode.DUPLICATE_DATA, "이미 있는 룰 세트 ID 입니다: " + id);
        }
        tx.executeWithoutResult(status -> {
            MdmRuleSet set = new MdmRuleSet(id, name, "[]");
            set.setDescription(blankToNull(request.getDescription()));
            setRepository.saveAndFlush(set);
        });
        return new RuleSetRegResult(id, 0L);
    }

    private static List<String> ruleIdsOf(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        return DomainJson.readList(json).stream().map(String::valueOf).toList();
    }

    private static String upper(String s) {
        return s == null ? null : s.toUpperCase(Locale.ROOT);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
