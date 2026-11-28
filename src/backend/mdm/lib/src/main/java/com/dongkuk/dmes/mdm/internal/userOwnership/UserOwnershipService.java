package com.dongkuk.dmes.mdm.internal.userOwnership;

import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdVersionEvent;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdVersionReader;
import com.dongkuk.dmes.mdm.internal.userOwnership.UserOwnershipKind.IdType;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.OwnershipHandoverItem;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.OwnershipHandoverRequest;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.OwnershipSummaryItem;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.UserRef;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 퇴직 처리 — 퇴직자를 소유자·담당자로 가리키는 MDM 데이터를 보여 주고 받는 사람에게 넘긴다(MCM 서버 호출, {@link UserOwnershipController}).
 *
 * <p>규칙:
 * <ul>
 *   <li>넘기기는 트랜잭션 하나다. 한 종류라도 실패하면 모두 되돌린다.</li>
 *   <li>사용자 ID 칸은 {@code toUserId}, 사번 칸은 {@code toEmpNo} 로 바꾼다. 사번 칸인데 사번(보내는 쪽·받는 쪽 어느 하나)이 없으면 그 종류는 건너뛰고
 *       {@code skipped=true} 로 알린다. 지금 MDM 스키마에는 사번 칸이 없다(모두 사용자 ID).</li>
 *   <li>받는 사람이 담당자(MDM_STEWARD)인지는 보지 않는다 — MDM 은 다른 사용자의 역할을 볼 수 없다({@code UnresolvedStewardDirectory}).
 *       받는 사람은 MCM 이 고른다.</li>
 *   <li>감사 U_USR_ID 는 호출 주체 {@link #ACTOR}({@code system:mcm}), U_SVC_ID 는 {@link #SERVICE_ID}, U_PGM_ID 는 동작 이름이다.
 *       요청 문맥(OASIS AuditHolder)이 없는 서버 호출이라 직접 만든다.</li>
 *   <li>ERD 는 실시간 화면이 있다 — 작업 중 표시는 {@link ErdEventHub#releaseAllOf} 로 지워 방송하고, 소유자·편집자가 바뀐 모델은 커밋 뒤 버전
 *       이벤트를 보낸다.</li>
 * </ul>
 */
@Service
public class UserOwnershipService {

    /** 감사 U_USR_ID — 이 API 를 부를 수 있는 유일한 주체({@link UserOwnershipController#MCM_PRINCIPAL}). */
    static final String ACTOR = UserOwnershipController.MCM_PRINCIPAL;
    static final String SERVICE_ID = "userOwnership";
    static final String ERD_EVENT_REASON = "HANDOVER";

    private final TransactionTemplate tx;
    private final UserOwnershipStore store;
    private final ErdEventHub erdHub;
    private final ErdVersionReader erdVersions;
    private final Clock clock;

    public UserOwnershipService(PlatformTransactionManager transactionManager, UserOwnershipStore store, ErdEventHub erdHub,
                                ErdVersionReader erdVersions, Clock clock) {
        this.tx = new TransactionTemplate(transactionManager);
        this.store = store;
        this.erdHub = erdHub;
        this.erdVersions = erdVersions;
        this.clock = clock;
    }

    /**
     * 사용자별·종류별 건수. 건수가 0 인 종류는 싣지 않는다. 순서는 요청한 사용자 순, 그 안에서 {@link UserOwnershipKind} 선언 순이다.
     * 사용자 ID 가 빈 항목은 버리고, 같은 사용자 ID 가 여럿이면 처음 것만 쓴다.
     */
    public List<OwnershipSummaryItem> summary(List<UserRef> users) {
        Map<String, String> empByUser = new LinkedHashMap<>(); // userId → empNo(없으면 null)
        if (users != null) {
            for (UserRef u : users) {
                String userId = u == null ? null : trim(u.userId());
                if (userId != null) {
                    empByUser.putIfAbsent(userId, trim(u.empNo()));
                }
            }
        }
        if (empByUser.isEmpty()) {
            return List.of();
        }
        Map<String, String> userByEmp = new LinkedHashMap<>();
        empByUser.forEach((userId, empNo) -> {
            if (empNo != null) userByEmp.putIfAbsent(empNo, userId);
        });

        Instant now = clock.instant();
        Map<String, Map<UserOwnershipKind, Long>> byUser = new LinkedHashMap<>();
        for (UserOwnershipKind kind : UserOwnershipKind.values()) {
            boolean byEmp = kind.idType() == IdType.EMP_NO;
            List<String> ids = List.copyOf(byEmp ? userByEmp.keySet() : empByUser.keySet());
            if (ids.isEmpty()) {
                continue;
            }
            store.count(kind, ids, now).forEach((key, cnt) -> {
                String userId = byEmp ? userByEmp.get(key) : key;
                if (userId != null && cnt != null && cnt > 0) {
                    byUser.computeIfAbsent(userId, k -> new LinkedHashMap<>()).put(kind, cnt);
                }
            });
        }

        List<OwnershipSummaryItem> items = new ArrayList<>();
        for (String userId : empByUser.keySet()) {
            Map<UserOwnershipKind, Long> kinds = byUser.get(userId);
            if (kinds == null) continue;
            for (UserOwnershipKind kind : UserOwnershipKind.values()) { // 선언 순
                Long cnt = kinds.get(kind);
                if (cnt != null) items.add(new OwnershipSummaryItem(userId, kind.name(), kind.label(), cnt));
            }
        }
        return items;
    }

    /**
     * 퇴직자가 가진 것을 받는 사람에게 넘기고 퇴직자의 작업 중 표시를 지운다(트랜잭션 하나). 모든 종류를 선언 순으로 돌려준다(0 건 포함).
     *
     * @throws InvalidRequest 사용자 ID 가 비었거나 보내는 쪽과 받는 쪽이 같다
     */
    public List<OwnershipHandoverItem> handover(OwnershipHandoverRequest r) {
        String fromUserId = trim(r == null ? null : r.fromUserId());
        String toUserId = trim(r == null ? null : r.toUserId());
        if (fromUserId == null) {
            throw new InvalidRequest("fromUserId 는 필수입니다");
        }
        if (toUserId == null) {
            throw new InvalidRequest("toUserId 는 필수입니다");
        }
        if (fromUserId.equals(toUserId)) {
            throw new InvalidRequest("받는 사람은 퇴직자와 달라야 합니다");
        }
        String fromEmpNo = trim(r.fromEmpNo());
        String toEmpNo = trim(r.toEmpNo());
        AuditStamp stamp = new AuditStamp(ACTOR, SERVICE_ID, "handover", clock.instant());

        return tx.execute(status -> {
            List<String> erdModels = store.erdDraftModelsOf(fromUserId); // 넘기기 전에 골라 둔다
            List<OwnershipHandoverItem> items = new ArrayList<>();
            for (UserOwnershipKind kind : UserOwnershipKind.values()) {
                if (kind == UserOwnershipKind.ERD_CLAIM) {
                    items.add(new OwnershipHandoverItem(kind.name(), kind.label(), erdHub.releaseAllOf(fromUserId), false));
                    continue;
                }
                String from = pick(kind.idType(), fromUserId, fromEmpNo);
                String to = pick(kind.idType(), toUserId, toEmpNo);
                if (from == null || to == null || from.equals(to)) {
                    items.add(new OwnershipHandoverItem(kind.name(), kind.label(), 0, true));
                    continue;
                }
                items.add(new OwnershipHandoverItem(kind.name(), kind.label(), store.reassign(kind, from, to, stamp), false));
            }
            announceErd(erdModels);
            return items;
        });
    }

    /**
     * 그 사용자의 ERD 작업 중 표시만 지운다. 지운 행 수를 돌려준다.
     *
     * @throws InvalidRequest 사용자 ID 가 비었다
     */
    public int releaseClaims(String userId) {
        String id = trim(userId);
        if (id == null) {
            throw new InvalidRequest("userId 는 필수입니다");
        }
        Integer n = tx.execute(status -> erdHub.releaseAllOf(id));
        return n == null ? 0 : n;
    }

    /** 소유자·편집자가 바뀐 ERD 모델의 지금 버전 상태를 커밋 뒤 보낸다(ErdEditService.announce 와 같은 이벤트). */
    private void announceErd(List<String> modelIds) {
        for (String modelId : modelIds) {
            ErdVersionEvent event = erdVersions.versionNow(modelId, ERD_EVENT_REASON, ACTOR);
            if (event != null) erdHub.publishVersion(event);
        }
    }

    /** 그 칸이 담는 값 — 사용자 ID 칸이면 사용자 ID, 사번 칸이면 사번(없으면 null). */
    static String pick(IdType idType, String userId, String empNo) {
        return idType == IdType.EMP_NO ? empNo : userId;
    }

    /** 요청 값이 잘못됐다 — 컨트롤러가 400 {@code USER_OWNERSHIP_INVALID} 로 돌려준다. */
    public static final class InvalidRequest extends RuntimeException {

        InvalidRequest(String message) {
            super(message);
        }
    }

    private static String trim(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
