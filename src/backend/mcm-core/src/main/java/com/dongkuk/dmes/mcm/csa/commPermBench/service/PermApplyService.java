/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench apply action — 저장된 초안을 한 트랜잭션으로 적용(잠금·검사·지문·잃는 사람 확인·쓰기·이력·초안 삭제·커밋 뒤 RoleChangedEvent)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchApplyRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.PermBenchResultRow;
import com.dongkuk.dmes.mcm.entity.SecPermDraft;
import com.dongkuk.dmes.mcm.entity.SecPermHis;
import com.dongkuk.dmes.mcm.entity.SecPermHisDtl;
import com.dongkuk.dmes.mcm.repository.SecPermDraftRepository;
import com.dongkuk.dmes.mcm.security.perm.ImpactCalculator;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.dongkuk.dmes.mcm.security.perm.PermGraph;
import com.dongkuk.dmes.mcm.security.perm.PermGraphLoader;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * apply action. 응답 = grid {@code result} 한 줄(APPLY_ID·CHANGE_CNT), BPMN output="result".
 *
 * <p><b>순서</b>(BPMN설계서 §2.5, 기능설계서 검증 순서 V-005 → V-006 → V-004 → V-008 → XV-003 → V-003 → V-009 → V-001 → V-002 → XV-002 → XV-001):
 * <ol>
 *   <li>내 초안 행 잠금({@link PermApplyStore#lockDraft}, WAIT 5) → 초안 읽기. 변경 0건 = {@code VALIDATION_ERROR}(V-005)</li>
 *   <li>메모 1,000자 이하(V-006, {@code VALIDATION_ERROR}). 변경의 범위가 기준 지문에 없으면 {@code PERM_DRAFT_CORRUPT}</li>
 *   <li>잠금({@link PermApplyStore#lockScopes}, WAIT 5) — 키 하나의 TreeSet(종류·키 오름차순: group → object → role → user).
 *       <ul>
 *         <li>지문 범위(기준 지문 키 = 변경 범위): USER_GRP → {@code user:KEY1}, GRP_ROLE → {@code group:KEY1}, ROLE_OBJ → {@code role:KEY1}</li>
 *         <li>잠금 전용 키(지문 비교에는 쓰지 않는다): USER_GRP → {@code group:KEY2}, GRP_ROLE → {@code role:KEY2},
 *             ROLE_OBJ ADD·UPD → {@code object:KEY2}(TB_MCM_SEC_OBJ). 검사(SYSADMIN 을 가진 그룹인가 V-009, 오브젝트 허용 값 V-002)가
 *             읽는 행을 다른 적용이 같은 때 바꾸지 못하게 한다 — 예: 다른 관리자가 그룹 G 에 SYSADMIN 을 붙이는 중이면
 *             G 에 사람을 넣는 적용은 기다렸다가 PERM_FORBIDDEN 을 받는다</li>
 *       </ul></li>
 *   <li>{@link PermChangeValidator#check}(APPLY) — 잠근 뒤라 XV-003(대상 없음)이 잠근 상태로 판정된다.
 *       PERM_BAD_VALUE·NOT_FOUND·PERM_FORBIDDEN·PERM_EMPTY_BTN·PERM_NOT_IN_OBJ. 이어서 BTN·POPUP 길이(1,000자) {@code PERM_BAD_VALUE}</li>
 *   <li>범위 지문 비교(기준 지문 키만) — 다르면 {@code PERM_CONFLICT: user:u1,role:R2}(XV-002)</li>
 *   <li>영향 다시 계산({@link PermImpactCalculator}, loadAll · 후보 = before ∪ after). 잃는 사람 ≥ 1 이고 confirmLoss ≠ Y 이면
 *       {@code PERM_NEED_CONFIRM: {잃는 사람 수}}(XV-001, FE 가 수를 확인 창에 보인다)</li>
 *   <li>쓰기 — USER_GRP → TB_MCM_SEC_USER_MAPPING, GRP_ROLE → TB_MCM_SEC_ROLEGROUP_MAPPING, ROLE_OBJ → TB_MCM_SEC_ROLE_PERM → flush.
 *       옛 TB_MCM_SEC_PERM·TB_MCM_SEC_ROLE_MAPPING 은 쓰지 않는다(D10). 제약 위반 = {@code PERM_CONFLICT: {범위}}</li>
 *   <li>이력 머리 TB_MCM_SEC_PERM_HIS + 줄 TB_MCM_SEC_PERM_HIS_DTL(실제로 쓴 변경만). 머리 PK 위반 = {@code PERM_BUSY}</li>
 *   <li>초안 행 삭제 → flush</li>
 *   <li>커밋 뒤(afterCommit) {@link RoleChangedEvent} 발행(Q-023). 실패·롤백이면 발행하지 않는다</li>
 * </ol>
 * 어디서 실패해도 OASIS process 트랜잭션(txBiz)이 전부 되돌리고 초안은 남는다. 잠금 대기 5초 초과(ORA-30006)·교착(ORA-00060) =
 * {@code PERM_BUSY: 다른 적용이 진행 중입니다}.
 *
 * <p><b>알려진 한계</b>
 * <ul>
 *   <li>(S10-1) 옛 화면 저장은 범위 부모 행을 잠그지 않는다. 5번 지문 비교와 커밋 사이에 옛 화면이 같은 행을 저장하면
 *       감지하지 못하고 나중 쓰기가 이긴다(lost update). 같은 키를 동시에 넣는 경우만 제약 위반 → PERM_CONFLICT 로 잡힌다</li>
 *   <li>범위가 겹치지 않는 두 적용은 줄 세우지 않는다. 효과가 겹치면(예: 한 쪽은 그룹 G 의 역할을, 다른 쪽은 G 에 든 사람의
 *       그룹을 바꿈) 6번의 GAIN·LOSE 건수와 잃는 사람 확인은 각자의 적용 전 상태 기준이라 두 적용이 모두 끝난 상태와 다를 수 있다.
 *       권한 자체는 두 쓰기가 모두 반영된 상태가 정답이다(각 쓰기는 자기 범위만 고친다)</li>
 * </ul>
 *
 * <p><b>쓰기 규칙</b>(Q-032 — 아무 일도 없는 변경은 이력 줄도 없다):
 * <ul>
 *   <li>USER_GRP·GRP_ROLE ADD = 연결이 없을 때만 넣는다. DEL = native DELETE 의 지운 행 수로 판정(0 = no-op)</li>
 *   <li>ROLE_OBJ ADD·UPD = 행이 없으면 넣고(이력 OP_TP=ADD), 있으면 BTN·POPUP 을 바꾸고 DATA_PERM 은 그대로(OP_TP=UPD).
 *       값이 같으면(토큰 집합 비교) 아무 일도 없다. 영향 계산의 {@code PermGraph.applyChanges} 가 ADD·UPD 를 같은 upsert 로
 *       다루므로 쓰기도 같게 둔다. 이력의 OP_TP 는 요청 OP 가 아니라 실제로 한 일이다. UPD 는 편집한 값만 쓴다 — 오브젝트 밖 옛 값은 버려진다(Q-033)</li>
 *   <li>ROLE_OBJ DEL = native DELETE 의 지운 행 수로 판정(이력 전 값은 지우기 직전에 읽은 값)</li>
 * </ul>
 *
 * <p><b>이력 값 형식</b>(BPMN설계서 §4.5 기본안 확정, Q-017):
 * <ul>
 *   <li>APPLY_ID = {@code PA} + KST {@code yyyyMMddHHmmssSSS} + 일련 3자리(총 22자). 일련은 JVM 마다 임의 시작점에서 1씩 늘고
 *       이미 있으면 다음 수. 남은 위험: 여러 노드가 같은 밀리초에 같은 일련을 고르면 머리 PK 위반 → {@code PERM_BUSY}(다시 시도하면 된다).
 *       DB 시퀀스는 마이그레이션이 필요해 perm-core 결정 대기</li>
 *   <li>USER_GRP·GRP_ROLE: ADD = {@code N} → {@code Y}, DEL = {@code Y} → {@code N}(연결 있음 여부)</li>
 *   <li>ROLE_OBJ: {@code BTN=find,save|POPUP=lotPop}(정리된 쉼표 목록, POPUP 이 비면 {@code BTN=find|POPUP=}). 행이 없으면 null.
 *       2,000자(코드 포인트)를 넘으면 앞 1,999자 + {@code …}</li>
 *   <li>KEY1·KEY2 = PermChange 의 key1·key2, SEQ_NO = 1부터 쓴 순서(초안 순서)</li>
 *   <li>CHANGE_CNT = 실제로 쓴 줄 수(이력 줄 수). GAIN_USER_CNT·LOSE_USER_CNT = 6번의 다시 계산한 값</li>
 * </ul>
 * 쓴 줄이 0건이어도(모두 no-op) 머리 한 줄은 남기고 초안을 지운다 — 적용했다는 사실은 남긴다. 그때 이벤트는 내지 않는다.
 *
 * <p><b>이벤트 roleIds</b> = 쓴 ROLE_OBJ 의 KEY1 ∪ 쓴 GRP_ROLE 의 KEY2 ∪ 쓴 USER_GRP 그룹이 가진 역할(적용 전 그래프 ∪ 적용 후 그래프).
 * USER_GRP 그룹에 역할이 하나도 없으면(전·후 모두) roleIds 가 빌 수 있다 — 그래도 발행한다: {@code UserPermCache} 는 roleIds 와
 * 무관하게 전체를 무효화한다(D30). BFF 리스너는 빈 roleIds 면 돌아가지만, 그때는 권한이 실제로 바뀌지 않았다.
 *
 * <p>가이드 §6-B: {@code @Transactional} 을 쓰지 않는다. 트랜잭션은 BPMN process {@code tx=txBiz}.
 */
@Service
public class PermApplyService {

    private static final Logger log = LoggerFactory.getLogger(PermApplyService.class);

    static final String VALIDATION = "VALIDATION_ERROR";
    static final String CONFLICT = "PERM_CONFLICT";
    static final String NEED_CONFIRM = "PERM_NEED_CONFIRM";
    static final String BUSY = "PERM_BUSY";
    static final String BAD_VALUE = PermChangeValidator.BAD_VALUE;

    /** 잠금 키 — 오브젝트(잠금 전용). 다른 접두는 {@link PermDraftFingerprint}. */
    public static final String OBJECT = "object:";

    static final int MEMO_MAX = 1000;
    static final int PERM_MAX = 1000;
    static final int VAL_MAX = 2000;

    static final String LINK_ON = "Y";
    static final String LINK_OFF = "N";

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter ID_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");
    /** 일련 — JVM 마다 임의 시작점(노드끼리 0부터 겹치지 않게). */
    private static final AtomicInteger SEQ = new AtomicInteger(new SecureRandom().nextInt(1000));

    private final SecPermDraftRepository drafts;
    private final PermApplyStore store;
    private final PermChangeValidator validator;
    private final PermDraftFingerprint fingerprint;
    private final ObjectProvider<PermGraphLoader> loaders;
    private final ObjectProvider<PermResolver> resolvers;
    private final ObjectProvider<ImpactCalculator> calculators;
    private final SecurityIdentity identity;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    @Autowired
    public PermApplyService(SecPermDraftRepository drafts, PermApplyStore store,
                            PermChangeValidator validator, PermDraftFingerprint fingerprint,
                            ObjectProvider<PermGraphLoader> loaders, ObjectProvider<PermResolver> resolvers,
                            ObjectProvider<ImpactCalculator> calculators, SecurityIdentity identity,
                            ApplicationEventPublisher events) {
        this(drafts, store, validator, fingerprint, loaders, resolvers, calculators, identity, events, Clock.system(KST));
    }

    /** 시각을 고정하는 구성(시험용). */
    PermApplyService(SecPermDraftRepository drafts, PermApplyStore store,
                     PermChangeValidator validator, PermDraftFingerprint fingerprint,
                     ObjectProvider<PermGraphLoader> loaders, ObjectProvider<PermResolver> resolvers,
                     ObjectProvider<ImpactCalculator> calculators, SecurityIdentity identity,
                     ApplicationEventPublisher events, Clock clock) {
        this.drafts = drafts;
        this.store = store;
        this.validator = validator;
        this.fingerprint = fingerprint;
        this.loaders = loaders;
        this.resolvers = resolvers;
        this.calculators = calculators;
        this.identity = identity;
        this.events = events;
        this.clock = clock;
    }

    /** 실제로 쓴 변경 한 줄(이력 줄). */
    record Applied(PermChange change, String opTp, String beforeVal, String afterVal) {
    }

    public List<Map<String, Object>> apply(CommPermBenchApplyRequest request) {
        CommPermBenchApplyRequest r = request != null ? request : new CommPermBenchApplyRequest();
        String owner = owner();
        boolean confirmLoss = "Y".equalsIgnoreCase(trimToEmpty(r.getConfirmLoss()));
        String memo = trimToNull(r.getMemo());

        // 1. 내 초안 행 잠금 → 읽기 (V-005)
        store.lockDraft(owner);
        SecPermDraft draft = drafts.findById(owner).orElse(null);
        List<PermChange> changes = draft == null ? List.of() : PermDraftService.parseChanges(draft.getDraftJson());
        if (changes.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, VALIDATION + ": 적용할 초안이 없습니다.");
        }
        // 2. V-006 · 기준 지문 범위
        if (memo != null && memo.length() > MEMO_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, VALIDATION + ": 메모는 1,000자 이하로 입력하세요.");
        }
        Map<String, String> base = PermDraftFingerprint.fromJson(draft.getBaseFpJson());
        TreeSet<String> scopes = PermDraftFingerprint.scopeKeys(changes);
        List<String> unbased = new ArrayList<>();
        for (String k : scopes) {
            if (!base.containsKey(k)) {
                unbased.add(k);
            }
        }
        if (!unbased.isEmpty()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, PermDraftService.DRAFT_CORRUPT
                    + ": 기준 지문에 없는 범위가 있습니다 (" + String.join(",", unbased) + "). 초안을 다시 저장하세요");
        }

        // 3. 잠금 — 지문 범위 ∪ 잠금 전용 키, 한 TreeSet(종류·키 순)
        TreeSet<String> lockKeys = new TreeSet<>(base.keySet());
        lockKeys.addAll(scopes);
        lockKeys.addAll(lockOnlyKeys(changes));
        store.lockScopes(lockKeys);

        // 4. 검사(잠근 상태 기준)
        validator.check(changes, PermChangeValidator.Mode.APPLY);
        checkLengths(changes);

        // 5. 지문 (XV-002) — 기준 지문 키만 비교
        List<String> conflicts = PermDraftFingerprint.differing(base, fingerprint.compute(base.keySet()));
        if (!conflicts.isEmpty()) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, CONFLICT + ": " + String.join(",", conflicts));
        }

        // 6. 영향 다시 계산 (XV-001)
        PermGraph before = require(loaders, "권한 그래프 로더(PermGraphLoader)").loadAll();
        PermImpactCalculator.Result impact = new PermImpactCalculator(
                require(resolvers, "권한 계산기(PermResolver)"), require(calculators, "영향 계산기(ImpactCalculator)"))
                // limit 0: apply 는 건수(gain·lose)만 쓴다. 2-인자판은 영향 줄을 모두 만든다(SYSADMIN 을 1,000명 그룹에 주면 약 100만 줄)
                .compute(before, changes, 0);
        if (impact.loseUserCnt() > 0 && !confirmLoss) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, NEED_CONFIRM + ": " + impact.loseUserCnt());
        }

        // 7. 쓰기 → flush (제약 위반 = 잠그지 않는 옛 화면 저장과 겹침)
        List<Applied> applied;
        try {
            applied = write(changes);
            store.flush();
        } catch (DataIntegrityViolationException e) {
            throw conflictOnWrite(scopes, e);
        }

        // 8. 이력
        LocalDateTime now = LocalDateTime.now(clock.withZone(KST));
        String applyId = newApplyId(now);
        SecPermHis his = new SecPermHis();
        his.setApplyId(applyId);
        his.setApplyUserId(owner);
        his.setApplyAt(now);
        his.setChangeCnt(applied.size());
        his.setGainUserCnt(impact.gainUserCnt());
        his.setLoseUserCnt(impact.loseUserCnt());
        his.setApplyMemo(memo);
        List<SecPermHisDtl> rows = new ArrayList<>(applied.size());
        int seq = 0;
        for (Applied a : applied) {
            SecPermHisDtl d = new SecPermHisDtl();
            d.setApplyId(applyId);
            d.setSeqNo(++seq);
            d.setTargetTp(a.change().tp());
            d.setKey1(a.change().key1());
            d.setKey2(a.change().key2());
            d.setOpTp(a.opTp());
            d.setBeforeVal(a.beforeVal());
            d.setAfterVal(a.afterVal());
            rows.add(d);
        }
        try {
            store.insertHistory(his, rows);
        } catch (DataIntegrityViolationException e) {
            // APPLY_ID 가 다른 노드의 적용과 같은 밀리초·같은 일련으로 겹침
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, BUSY + ": 다른 적용과 겹쳤습니다. 다시 시도해 주세요");
        }

        // 9. 초안 삭제
        try {
            drafts.delete(draft);
            store.flush();
        } catch (DataIntegrityViolationException e) {
            throw conflictOnWrite(scopes, e);
        }

        // 10. 커밋 뒤 이벤트
        if (!applied.isEmpty()) {
            List<PermChange> done = applied.stream().map(Applied::change).toList();
            publishAfterCommit(new RoleChangedEvent(roleIdsOf(done, before, before.applyChanges(done))));
        }
        return List.of(new PermBenchResultRow(applyId, applied.size()).toRow());
    }

    /** 잠금 전용 키 — USER_GRP group:KEY2, GRP_ROLE role:KEY2, ROLE_OBJ ADD·UPD object:KEY2. */
    static Set<String> lockOnlyKeys(List<PermChange> changes) {
        Set<String> out = new TreeSet<>();
        for (PermChange c : changes) {
            switch (c.tp()) {
                case PermChange.USER_GRP -> out.add(PermDraftFingerprint.GROUP + c.key2());
                case PermChange.GRP_ROLE -> out.add(PermDraftFingerprint.ROLE + c.key2());
                case PermChange.ROLE_OBJ -> {
                    if (!PermChange.DEL.equals(c.op())) {
                        out.add(OBJECT + c.key2());
                    }
                }
                default -> { }
            }
        }
        return out;
    }

    private static BusinessException conflictOnWrite(Set<String> scopes, DataIntegrityViolationException e) {
        log.warn("[commPermBench] apply 쓰기 제약 위반(다른 저장과 겹침): scopes={}, msg={}", scopes, e.getMessage());
        return new BusinessException(ErrorCode.BUSINESS_ERROR, CONFLICT + ": " + String.join(",", scopes));
    }

    // ────────────────────────────────────────────────────────────────
    // 쓰기
    // ────────────────────────────────────────────────────────────────

    List<Applied> write(List<PermChange> changes) {
        List<Applied> out = new ArrayList<>();
        for (PermChange c : changes) {
            boolean add = PermChange.ADD.equals(c.op());
            boolean del = PermChange.DEL.equals(c.op());
            switch (c.tp()) {
                case PermChange.USER_GRP -> {
                    if (add && !store.userGroupExists(c.key1(), c.key2())) {
                        store.insertUserGroup(c.key1(), c.key2());
                        out.add(new Applied(c, PermChange.ADD, LINK_OFF, LINK_ON));
                    } else if (del && store.deleteUserGroup(c.key1(), c.key2())) {
                        out.add(new Applied(c, PermChange.DEL, LINK_ON, LINK_OFF));
                    }
                }
                case PermChange.GRP_ROLE -> {
                    if (add && !store.groupRoleExists(c.key1(), c.key2())) {
                        store.insertGroupRole(c.key1(), c.key2());
                        out.add(new Applied(c, PermChange.ADD, LINK_OFF, LINK_ON));
                    } else if (del && store.deleteGroupRole(c.key1(), c.key2())) {
                        out.add(new Applied(c, PermChange.DEL, LINK_ON, LINK_OFF));
                    }
                }
                case PermChange.ROLE_OBJ -> {
                    if (del) {
                        store.deleteRolePerm(c.key1(), c.key2()).ifPresent(gone ->
                                out.add(new Applied(c, PermChange.DEL, permVal(gone.btnPerm(), gone.popupPerm()), null)));
                    } else {
                        String btn = PermTokens.join(PermTokens.parse(c.btnPerm()));
                        String popup = emptyToNull(PermTokens.join(PermTokens.parse(c.popupPerm())));
                        Optional<PermApplyStore.PermRow> row = store.findRolePerm(c.key1(), c.key2());
                        if (row.isEmpty()) {
                            store.insertRolePerm(c.key1(), c.key2(), btn, popup);
                            out.add(new Applied(c, PermChange.ADD, null, permVal(btn, popup)));
                        } else if (!sameTokens(row.get().btnPerm(), btn) || !sameTokens(row.get().popupPerm(), popup)) {
                            store.updateRolePerm(c.key1(), c.key2(), btn, popup);
                            out.add(new Applied(c, PermChange.UPD,
                                    permVal(row.get().btnPerm(), row.get().popupPerm()), permVal(btn, popup)));
                        }
                    }
                }
                default -> throw new BusinessException(ErrorCode.INVALID_VALUE, BAD_VALUE + ": 알 수 없는 TP 입니다 (" + c.tp() + ")");
            }
        }
        return out;
    }

    /** ROLE_OBJ 이력 값 {@code BTN=a,b|POPUP=c}. 2,000자(코드 포인트)를 넘으면 자른다. */
    static String permVal(String btn, String popup) {
        String v = "BTN=" + PermTokens.join(PermTokens.parse(btn)) + "|POPUP=" + PermTokens.join(PermTokens.parse(popup));
        if (v.codePointCount(0, v.length()) <= VAL_MAX) {
            return v;
        }
        return v.substring(0, v.offsetByCodePoints(0, VAL_MAX - 1)) + "…";
    }

    private static boolean sameTokens(String a, String b) {
        return new LinkedHashSet<>(PermTokens.parse(a)).equals(new LinkedHashSet<>(PermTokens.parse(b)));
    }

    /** BTN_PERM·POPUP_PERM 칸 길이(1,000자) — DB 오류 대신 코드로 거절한다. */
    private static void checkLengths(List<PermChange> changes) {
        for (PermChange c : changes) {
            if (!PermChange.ROLE_OBJ.equals(c.tp()) || PermChange.DEL.equals(c.op())) {
                continue;
            }
            if (PermTokens.join(PermTokens.parse(c.btnPerm())).length() > PERM_MAX
                    || PermTokens.join(PermTokens.parse(c.popupPerm())).length() > PERM_MAX) {
                throw new BusinessException(ErrorCode.INVALID_VALUE,
                        BAD_VALUE + ": 버튼·팝업 값은 1,000자 이하여야 합니다 (" + c.key1() + "/" + c.key2() + ")");
            }
        }
    }

    // ────────────────────────────────────────────────────────────────
    // 이벤트
    // ────────────────────────────────────────────────────────────────

    /** ROLE_OBJ KEY1 ∪ GRP_ROLE KEY2 ∪ USER_GRP 그룹의 역할(before ∪ after). */
    static Set<String> roleIdsOf(List<PermChange> done, PermGraph before, PermGraph after) {
        Set<String> out = new TreeSet<>();
        for (PermChange c : done) {
            switch (c.tp()) {
                case PermChange.ROLE_OBJ -> out.add(c.key1());
                case PermChange.GRP_ROLE -> out.add(c.key2());
                case PermChange.USER_GRP -> {
                    out.addAll(before.groupRoles().getOrDefault(c.key2(), Set.of()));
                    out.addAll(after.groupRoles().getOrDefault(c.key2(), Set.of()));
                }
                default -> { }
            }
        }
        return out;
    }

    /**
     * 동기화가 켜진 트랜잭션 안이면 커밋 뒤(afterCommit)에 발행한다. 트랜잭션이 아예 없으면(시험·직접 호출) 곧바로 발행한다.
     * 실제 트랜잭션은 있는데 동기화가 꺼져 있으면 커밋 시점을 알 수 없으므로 커밋 전에 발행하지 않고 경고만 남긴다
     * (UserPermCache·BFF 캐시는 TTL 로 반영된다).
     */
    private void publishAfterCommit(RoleChangedEvent event) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    events.publishEvent(event);
                }
            });
        } else if (TransactionSynchronizationManager.isActualTransactionActive()) {
            log.warn("[commPermBench] 트랜잭션 동기화가 꺼져 있어 RoleChangedEvent 를 발행하지 않습니다(커밋 전 발행 방지): roleIds={}",
                    event.getRoleIds());
        } else {
            events.publishEvent(event);
        }
    }

    // ────────────────────────────────────────────────────────────────
    // 도우미
    // ────────────────────────────────────────────────────────────────

    /** {@code PA} + yyyyMMddHHmmssSSS + 일련 3자리. 이미 있으면 다음 일련. */
    String newApplyId(LocalDateTime at) {
        String prefix = "PA" + ID_TIME.format(at);
        for (int i = 0; i < 1000; i++) {
            String id = prefix + String.format("%03d", Math.floorMod(SEQ.getAndIncrement(), 1000));
            if (!store.applyIdExists(id)) {
                return id;
            }
        }
        throw new BusinessException(ErrorCode.BUSINESS_ERROR, BUSY + ": 다른 적용과 겹쳤습니다. 다시 시도해 주세요");
    }

    private String owner() {
        String user = identity.currentUserId();
        if (user == null || user.isBlank()) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED, PermDraftService.NO_USER + ": 로그인한 사용자를 알 수 없습니다");
        }
        return user;
    }

    private static <T> T require(ObjectProvider<T> p, String what) {
        T t = p.getIfAvailable();
        if (t == null) {
            throw new BusinessException(ErrorCode.SERVICE_EXECUTION_ERROR,
                    PermBenchGraphSource.NOT_READY + ": " + what + "가 아직 등록되지 않았습니다");
        }
        return t;
    }

    private static String trimToEmpty(String s) {
        return s == null ? "" : s.trim();
    }

    private static String trimToNull(String s) {
        String t = trimToEmpty(s);
        return t.isEmpty() ? null : t;
    }

    private static String emptyToNull(String s) {
        return s == null || s.isEmpty() ? null : s;
    }
}
