package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 모델 완전 삭제(ERD 2차 §7.2, {@code delete kind=MODEL}). 되돌리기 없음.
 *
 * <p>순서: 모델 행 잠금({@link ErdModelStore#lockRev} — 명령·버전 동작과 같은 첫 잠금이라 진행 중인 저장이 끝난 뒤에 돈다) → 권한(버전 행 잠금) →
 * CLAIM·EDITOR·CMD_LOG·DIAGRAM_ROUTE·DIAGRAM_NODE·DIAGRAM·MODEL_VER·MODEL 삭제(FK 순서) → 커밋 뒤 구독자 알림
 * ({@link ErdEventHub#modelDeleted}). 표시 행({@link ErdReloadMarker})은 쓰지 않는다 — 지울 명령 기록·REV 에 쓰는 것이라서다.
 *
 * <p>권한: 관리자(역할 {@code MDM_STD_ADMIN} 또는 {@code SYSADMIN})는 확정본이 있어도 지운다. 그 밖에는 DRAFT 소유자({@code _VER.OWNER_ID})이고
 * RELEASED·REQUESTED·APPROVED 버전이 하나도 없을 때만이다(CANCELLED 는 막지 않는다). 거절 코드(계약에 있는 것만 쓴다):
 * <ul>
 *   <li>DRAFT 가 없다 = 관리자만 지운다 → MDM016(STD_ADMIN_ROLE_REQUIRED)</li>
 *   <li>DRAFT 소유자가 아니다·소유자가 없는 DRAFT·막는 버전이 있다 → MDM003(NOT_DRAFT_OWNER). 이유는 문구에 싣는다</li>
 * </ul>
 * {@code MdmStdAdminGuard} 는 SYSADMIN 만으로는 거부하므로 쓰지 않는다. 역할은 요청 헤더(X-Client-Key 뒤 X-Authenticated-Role)에서만 오고,
 * 요청 칸(userId 등)은 보지 않는다. 지운 사람·모델·rev 는 커밋 뒤 서버 로그(info)에 한 줄 남긴다 — 명령 기록도 함께 지워지기 때문이다.
 *
 * <p>작업 중 표시(CLAIM)는 모델 행을 잠그지 않고 넣는다(풀 연결을 아끼려고 저장 잠금을 기다리지 않는다). 그래서 잠근 뒤 CLAIM 을 지운 사이에
 * 다른 요청이 표시를 넣고 커밋하면 모델 행 삭제가 ORA-02292 가 된다. 그때는 표시를 다시 지우고 모델 행 삭제를 다시 한다({@value #MODEL_DELETE_TRIES}번).
 * 둘째 문장부터는 JdbcTemplate 으로 해 실패한 문장만 되돌아간다(JPA 예외는 트랜잭션을 rollback-only 로 만든다).
 *
 * <p>트랜잭션: OASIS 트랜잭션이 있으면 합류하고, 없으면(직접 호출) 새로 연다. 던지면 바깥 트랜잭션도 되돌아간다.
 */
@Component
public class ErdModelDeletion {

    /** 시스템 관리자 역할 ID(MetaFeedService 와 같은 값. MdmRoles 에는 없다 — 기존대로 PERM_ALL). */
    static final String SYSADMIN = "SYSADMIN";
    /** 비관리자 삭제를 막는 버전 상태. */
    static final Set<String> BLOCKING = Set.of("RELEASED", "REQUESTED", "APPROVED");

    private static final Logger log = LoggerFactory.getLogger(ErdModelDeletion.class);
    static final int MODEL_DELETE_TRIES = 3;
    private static final String DELETE_CLAIMS = "DELETE FROM TB_MDM_ERD_CLAIM WHERE ERD_MODEL_ID = ?";
    private static final String DELETE_MODEL = "DELETE FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ?";

    /** FK 순서(CLAIM 과 MODEL 은 {@link #deleteModelRow}). ROUTE·NODE 는 그 모델의 다이어그램으로 찾는다(모델 칸이 없다). */
    private static final List<String> DELETES = List.of(
            "DELETE FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID = ?",
            "DELETE FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = ?",
            "DELETE FROM TB_MDM_ERD_DIAGRAM_ROUTE WHERE DIAGRAM_ID IN (SELECT DIAGRAM_ID FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = ?)",
            "DELETE FROM TB_MDM_ERD_DIAGRAM_NODE WHERE DIAGRAM_ID IN (SELECT DIAGRAM_ID FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = ?)",
            "DELETE FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = ?",
            "DELETE FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = ?");

    private final EntityManager em;
    private final JdbcTemplate jdbc;
    private final ErdModelStore store;
    private final ErdEventHub hub;
    private final TransactionTemplate tx;

    public ErdModelDeletion(EntityManager em, JdbcTemplate jdbc, ErdModelStore store, ErdEventHub hub,
                            PlatformTransactionManager transactionManager) {
        this.em = em;
        this.jdbc = jdbc;
        this.store = store;
        this.hub = hub;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** 없는 모델이면 ERD_MODEL_NOT_FOUND(MDM029), 권한이 없으면 MDM003·MDM016. */
    public void delete(String modelId, String userId, Set<String> roleIds) {
        tx.executeWithoutResult(s -> {
            long rev = store.lockRev(modelId);
            boolean admin = isAdmin(roleIds);
            if (!admin) requireOwnerWithoutConfirmed(modelId, userId);
            jdbc.update(DELETE_CLAIMS, modelId);
            for (String sql : DELETES) em.createNativeQuery(sql).setParameter(1, modelId).executeUpdate();
            em.clear(); // 지운 행의 엔티티를 문맥에 남기지 않는다
            deleteModelRow(modelId);
            hub.modelDeleted(modelId, rev + 1);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    log.info("[erd] 모델 삭제 model={} user={} admin={} roles={} lastRev={}", modelId, userId, admin, roleIds, rev);
                }
            });
        });
    }

    /** 모델 행 삭제. 사이에 들어와 커밋된 작업 중 표시가 있으면(ORA-02292) 그 표시를 지우고 다시 한다. */
    private void deleteModelRow(String modelId) {
        for (int i = 1; ; i++) {
            try {
                jdbc.update(DELETE_MODEL, modelId);
                return;
            } catch (DataIntegrityViolationException e) {
                if (!mentions(e, "FK_TB_MDM_ERD_CLAIM_MODEL")) throw e;
                if (i >= MODEL_DELETE_TRIES) {
                    throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT,
                            "모델을 지우는 동안 작업 중 표시가 계속 들어옵니다. 잠시 뒤 다시 시도하세요", List.of());
                }
                jdbc.update(DELETE_CLAIMS, modelId);
            }
        }
    }

    static boolean mentions(Throwable e, String constraint) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t.getMessage() != null && t.getMessage().contains(constraint)) return true;
            if (t.getCause() == t) break;
        }
        return false;
    }

    static boolean isAdmin(Set<String> roleIds) {
        return roleIds != null && (roleIds.contains(MdmRoles.STD_ADMIN) || roleIds.contains(SYSADMIN));
    }

    /** 잠근 뒤에 버전 행을 네이티브로 읽는다(엔티티는 공통 버전 서비스의 네이티브 쓰기 뒤 낡을 수 있다). */
    @SuppressWarnings("unchecked")
    private void requireOwnerWithoutConfirmed(String modelId, String userId) {
        // FOR UPDATE: 소유권 동작(lock·unlock·handover)은 모델 행을 잠그지 않는다 — 판정과 삭제 사이에 소유자가 바뀌지 않게 버전 행도 잡는다
        // (모델 → 버전 순서라 다른 동작과 교착하지 않는다).
        List<Object[]> rows = em.createNativeQuery(
                        "SELECT VER, STATUS, OWNER_ID FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = ? ORDER BY VER FOR UPDATE")
                .setParameter(1, modelId).getResultList();
        boolean hasDraft = false;
        String draftOwner = null;
        List<String> blocking = new ArrayList<>();
        for (Object[] r : rows) {
            String status = (String) r[1];
            if ("DRAFT".equals(status)) {
                hasDraft = true;
                draftOwner = (String) r[2];
            }
            if (BLOCKING.contains(status)) blocking.add(status + " " + VersionNumbers.plain(toDecimal(r[0])));
        }
        if (!hasDraft) {
            throw MdmErrors.of(MdmErrorCode.STD_ADMIN_ROLE_REQUIRED,
                    "DRAFT 가 없는 모델은 관리자(MDM_STD_ADMIN·SYSADMIN)만 지울 수 있습니다", List.of());
        }
        if (draftOwner == null || draftOwner.isBlank()) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT_OWNER,
                    "소유자가 없는 DRAFT 입니다. 먼저 선점(lock)해 소유자가 되거나 관리자(MDM_STD_ADMIN·SYSADMIN)에게 요청하세요", List.of());
        }
        if (!draftOwner.equals(userId)) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT_OWNER,
                    "모델 삭제는 DRAFT 소유자(" + draftOwner + ") 또는 관리자(MDM_STD_ADMIN·SYSADMIN)만 할 수 있습니다", List.of());
        }
        if (!blocking.isEmpty()) {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT_OWNER,
                    "확정·요청·승인된 버전(" + String.join(", ", blocking) + ")이 있는 모델은 관리자(MDM_STD_ADMIN·SYSADMIN)만 지울 수 있습니다",
                    List.of());
        }
    }

    private static BigDecimal toDecimal(Object v) {
        return v instanceof BigDecimal b ? b : new BigDecimal(v.toString());
    }
}
