package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.entity.MdmErdModelVer;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * ERD 모델·버전 읽기와 네이티브 쓰기({@code RuleSetWrites} 선례). 상태·REV·JSON 은 엔티티에서 {@code updatable=false} 라 네이티브로만 쓴다.
 * 쓰기({@link #setRev}·{@link #writeJson})는 호출자의 트랜잭션에 합류하고, 없으면 자기 트랜잭션을 연다.
 */
@Component
public class ErdModelStore {

    private static final String AUDIT_SET = "U_USR_ID = :uUsrId, U_AT = :uAt, U_SVC_ID = :uSvcId, U_PGM_ID = :uPgmId";

    private final EntityManager em;
    private final MdmNativeAuditSupport auditSupport;
    private final MdmTemporalBinder temporal;

    public ErdModelStore(EntityManager em, MdmNativeAuditSupport auditSupport, MdmTemporalBinder temporal) {
        this.em = em;
        this.auditSupport = auditSupport;
        this.temporal = temporal;
    }

    /**
     * 모델 행을 잠그고 현재 REV 를 읽는다 — 모델 단위로 명령을 하나씩 처리하는 자리(스펙 2.1-2). 자동 커밋이면 FOR UPDATE 가 바로 풀려
     * 잠금이 되지 않으므로 호출자 트랜잭션이 반드시 있어야 한다(R8-2). 없으면 {@code IllegalTransactionStateException} 이다.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public long lockRev(String modelId) {
        List<?> rows = em.createNativeQuery("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ? FOR UPDATE")
                .setParameter(1, modelId).getResultList();
        if (rows.isEmpty()) throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
        return ((Number) rows.get(0)).longValue();
    }

    /** 잠그지 않고 REV 를 읽는다. */
    public long rev(String modelId) {
        List<?> rows = em.createNativeQuery("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ?")
                .setParameter(1, modelId).getResultList();
        if (rows.isEmpty()) throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
        return ((Number) rows.get(0)).longValue();
    }

    /** 영속성 문맥의 쓰기를 DB 로 내보낸다. 같은 트랜잭션의 값을 JdbcTemplate 으로 읽기 전에 부른다(버전 이벤트 S2-12). */
    public void flush() {
        if (TransactionSynchronizationManager.isActualTransactionActive()) em.flush();
    }

    @Transactional
    public void setRev(String modelId, long rev) {
        int n = audited("UPDATE TB_MDM_ERD_MODEL SET REV = :rev, " + AUDIT_SET + ", VER = COALESCE(VER, 0) + 1 WHERE ERD_MODEL_ID = :id")
                .setParameter("rev", rev).setParameter("id", modelId).executeUpdate();
        if (n == 0) throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
    }

    /** 그 모듈의 모델 ID(모듈 하나 = 모델 하나, 스펙 D2). 없으면 empty. */
    public Optional<String> modelOfModule(String moduleId) {
        return em.createQuery("SELECT m.erdModelId FROM MdmErdModel m WHERE m.moduleId = :mod", String.class)
                .setParameter("mod", moduleId).setMaxResults(1).getResultList().stream().findFirst();
    }

    // 조회는 getResultStream 이 아니라 getResultList 로 한다 — 트랜잭션 밖이면 EntityManager 가 호출 직후 닫혀 지연된 스트림이 ORA-17010 으로 죽는다.
    public Optional<MdmErdModelVer> draft(String modelId) {
        return em.createQuery("SELECT v FROM MdmErdModelVer v WHERE v.erdModelId = :id AND v.status = 'DRAFT'", MdmErdModelVer.class)
                .setParameter("id", modelId).getResultList().stream().findFirst();
    }

    public Optional<MdmErdModelVer> latestReleased(String modelId) {
        return em.createQuery("SELECT v FROM MdmErdModelVer v WHERE v.erdModelId = :id AND v.status = 'RELEASED' ORDER BY v.ver DESC",
                        MdmErdModelVer.class)
                .setParameter("id", modelId).setMaxResults(1).getResultList().stream().findFirst();
    }

    /** DRAFT 우선, 없으면 최신 RELEASED. 둘 다 없으면 ERD_MODEL_NOT_FOUND. */
    public MdmErdModelVer current(String modelId) {
        return draft(modelId).or(() -> latestReleased(modelId))
                .orElseThrow(() -> MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND));
    }

    public Optional<MdmErdModelVer> find(VersionRef ref) {
        return em.createQuery("SELECT v FROM MdmErdModelVer v WHERE v.erdModelId = :id AND v.ver = :ver", MdmErdModelVer.class)
                .setParameter("id", ref.objectId()).setParameter("ver", VersionNumbers.scaled(ref.ver())).getResultList().stream().findFirst();
    }

    /**
     * 버전 행의 MODEL_JSON 을 바꾼다. 소유자·row_version 검사는 호출 직전 공통 가드({@code beginDraftWrite})가 맡는다. 바뀐 엔티티가 영속성
     * 컨텍스트에 낡은 값으로 남지 않게 {@code em.clear()} 로 비운다 — 호출자는 이 뒤에 엔티티를 다시 읽어야 한다(전에 읽은 엔티티는
     * 분리된다). {@link #setRev} 는 비우지 않는다.
     */
    @Transactional
    public void writeJson(VersionRef ref, String json) {
        NativeQuery<?> q = audited("UPDATE TB_MDM_ERD_MODEL_VER SET MODEL_JSON = :json, " + AUDIT_SET
                + ", AUD_VER = COALESCE(AUD_VER, 0) + 1 WHERE ERD_MODEL_ID = :id AND VER = :ver")
                .setParameter("id", ref.objectId()).setParameter("ver", VersionNumbers.scaled(ref.ver()));
        q.setParameter("json", json, String.class);
        int n = q.executeUpdate();
        em.clear();
        if (n == 0) throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
    }

    private NativeQuery<?> audited(String sql) {
        em.flush();
        AuditStamp stamp = auditSupport.currentStamp();
        NativeQuery<?> q = em.createNativeQuery(sql).unwrap(NativeQuery.class);
        q.setParameter("uAt", temporal.toDb(stamp.at()));
        q.setParameter("uUsrId", stamp.userId(), String.class);
        q.setParameter("uSvcId", stamp.serviceId(), String.class);
        q.setParameter("uPgmId", stamp.programId(), String.class);
        return q;
    }
}
