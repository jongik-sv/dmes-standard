/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench 초안 — loadDraft·saveDraft·discardDraft 와 source=DRAFT 이음매(PermBenchDraftReader) 구현
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchDraftRow;
import com.dongkuk.dmes.mcm.entity.SecPermDraft;
import com.dongkuk.dmes.mcm.repository.SecPermDraftRepository;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 내 초안(관리자마다 1건, D22) 읽기·전체 교체 저장·버리기.
 *
 * <ul>
 *   <li>소유자 = 인증 컨텍스트의 사용자({@link SecurityIdentity}). 요청 {@code meta.userId} 는 믿지 않는다(BPMN설계서 §1.4).</li>
 *   <li>저장 = 전체 교체(Q-018, 멱등). 변경 0건이면 초안 행을 지운다.</li>
 *   <li>저장 검사 = {@link PermChangeValidator}(구조·중복·SYSADMIN·빈 BTN·오브젝트 허용 값). apply(b4)가 같은 검사기로 다시 검사한다.</li>
 *   <li>기준 지문 = {@link PermDraftFingerprint#extend}: 처음 건드린 범위만 지금 값으로 찍고 이후 저장에서는 유지한다.</li>
 * </ul>
 *
 * <p>가이드 §6-B: {@code @Transactional} 을 쓰지 않는다. 쓰기는 OASIS process 수준 txBiz 자동 감싸기 안에서 돌아(가이드 02 §6-B-2)
 * 저장·삭제가 원자적이고, 저장 때 건 초안 행 잠금({@link PermDraftRowLock})은 커밋까지 유지된다.
 * 오류 = {@link BusinessException} 메시지 {@code CODE: 상세}.
 */
@Service
public class PermDraftService implements PermBenchDraftReader {

    static final String NO_USER = "PERM_NO_USER";
    static final String DRAFT_BUSY = "PERM_DRAFT_BUSY";
    static final String DRAFT_CORRUPT = "PERM_DRAFT_CORRUPT";

    private static final DateTimeFormatter U_AT_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final SecPermDraftRepository drafts;
    private final PermDraftFingerprint fingerprint;
    private final PermChangeValidator validator;
    private final SecurityIdentity identity;
    private final PermDraftRowLock rowLock;

    public PermDraftService(SecPermDraftRepository drafts, PermDraftFingerprint fingerprint,
                            PermChangeValidator validator, SecurityIdentity identity, PermDraftRowLock rowLock) {
        this.rowLock = rowLock;
        this.drafts = drafts;
        this.fingerprint = fingerprint;
        this.validator = validator;
        this.identity = identity;
    }

    // ────────────────────────────────────────────────────────────────
    // action
    // ────────────────────────────────────────────────────────────────

    /** 내 초안(단일 grid — 서비스는 행 목록을 돌려주고 BPMN output="draft"). 없으면 한 줄(CHANGES_JSON="[]", CHANGE_CNT=0, U_AT=null) — FE 의 초안 없음(NONE) 상태. */
    public List<Map<String, Object>> loadDraft() {
        return draftGrid(drafts.findById(owner()).orElse(null));
    }

    /**
     * 내 초안을 {@code changes}(행 키 TP·KEY1·KEY2·OP·BTN_PERM·POPUP_PERM)로 통째로 바꾼다. 응답 = 저장된 draft 한 줄.
     * 변경 0건 = 초안 삭제(빈 draft 응답).
     */
    public List<Map<String, Object>> saveDraft(List<Map<String, Object>> changes) {
        String owner = owner();
        List<PermChange> list = validator.validate(changes);
        if (list.isEmpty()) {
            deleteIfPresent(owner);
            return draftGrid(null);
        }
        rowLock.lock(owner); // 기준 지문을 읽기 전에 같은 관리자의 동시 저장·적용·버리기를 줄 세운다
        SecPermDraft draft = drafts.findById(owner).orElseGet(() -> new SecPermDraft(owner));
        Map<String, String> base = PermDraftFingerprint.fromJson(draft.getBaseFpJson());
        draft.setBaseFpJson(PermDraftFingerprint.toJson(fingerprint.extend(base, PermDraftFingerprint.scopeKeys(list))));
        draft.setDraftJson(toJson(list));
        draft.setChangeCnt(list.size());
        try {
            return draftGrid(drafts.saveAndFlush(draft));
        } catch (DataIntegrityViolationException | OptimisticLockingFailureException e) {
            // PK 중복 = 같은 관리자의 다른 탭이 첫 저장과 동시에 들어옴. StaleState = 읽은 뒤 적용·버리기가 행을 지움. 다시 저장하면 된다.
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, DRAFT_BUSY + ": 초안을 동시에 저장했습니다. 다시 시도하세요");
        }
    }

    /** 내 초안을 지운다. 없어도 성공. 응답 grid 없음. */
    public void discardDraft() {
        deleteIfPresent(owner());
    }

    // ────────────────────────────────────────────────────────────────
    // 이음매(b1 PermBenchGraphSource) · 다른 레인(b3 impact·b4 apply)이 쓰는 읽기
    // ────────────────────────────────────────────────────────────────

    /** source=DRAFT 용. 로그인 사용자가 없거나 초안이 없으면 빈 목록. */
    @Override
    public List<PermChange> savedChanges() {
        String user = identity.currentUserId();
        if (user == null || user.isBlank()) {
            return List.of();
        }
        return drafts.findById(user).map(d -> parseChanges(d.getDraftJson())).orElse(List.of());
    }

    /** 내 초안의 변경 목록(없으면 빈 목록). impact(b3) 용. */
    public List<PermChange> myChanges() {
        return drafts.findById(owner()).map(d -> parseChanges(d.getDraftJson())).orElse(List.of());
    }

    /** 내 초안 엔티티(없으면 empty). */
    public Optional<SecPermDraft> findMine() {
        return drafts.findById(owner());
    }

    /** DRAFT_JSON → 변경 목록. null·빈 문자열 = 빈 목록, 깨진 JSON = {@code PERM_DRAFT_CORRUPT}. */
    public static List<PermChange> parseChanges(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return List.copyOf(JSON.readValue(json, new TypeReference<List<PermChange>>() { }));
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, DRAFT_CORRUPT + ": 초안(DRAFT_JSON)을 읽을 수 없습니다");
        }
    }

    // ────────────────────────────────────────────────────────────────
    // 내부
    // ────────────────────────────────────────────────────────────────

    private String owner() {
        String user = identity.currentUserId();
        if (user == null || user.isBlank()) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED, NO_USER + ": 로그인한 사용자를 알 수 없습니다");
        }
        return user;
    }

    private void deleteIfPresent(String owner) {
        if (drafts.existsById(owner)) {
            drafts.deleteById(owner);
        }
    }

    private static String toJson(List<PermChange> changes) {
        try {
            return JSON.writeValueAsString(changes);
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, DRAFT_CORRUPT + ": 초안을 JSON 으로 만들 수 없습니다");
        }
    }

    private static List<Map<String, Object>> draftGrid(SecPermDraft d) {
        PermBenchDraftRow row;
        if (d == null) {
            row = new PermBenchDraftRow("[]", 0, null);
        } else {
            row = new PermBenchDraftRow(d.getDraftJson() == null ? "[]" : d.getDraftJson(),
                    d.getChangeCnt() == null ? 0 : d.getChangeCnt(), formatAt(d.getUpdatedAt()));
        }
        return List.of(row.toRow());
    }

    private static String formatAt(Instant at) {
        return at == null ? null : U_AT_FORMAT.format(at.atZone(ZoneId.systemDefault()));
    }
}
