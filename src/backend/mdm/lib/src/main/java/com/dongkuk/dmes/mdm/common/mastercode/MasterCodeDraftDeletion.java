package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentTable;
import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Component;

/**
 * 마루 코드 DRAFT 삭제 훅 — 세 선분 표를 DRAFT 만들기 전 모습으로 되돌린다(TSK-06-02 design.md §6.5-3, 불변 규칙 I14).
 *
 * <p>공통 {@code VersionStateService.deleteDraft} 가 VER 행을 지우기 <b>전에</b> 같은 트랜잭션에서 부른다. 표마다
 * {@code FROM_VER = V} 행을 지우고 {@code TO_VER = V} 행을 열린 끝(9999)으로 되돌린다. 그 밖의 행은 건드리지 않는다.
 * 1.000 DRAFT 면 BASE 도 사라진다. SQL 은 등호 조건만 쓰고 버전은 {@code setScale(3)} 으로 바인딩한다(I20, 규칙표 #17).
 * 되돌린 행은 감사 U_* 칼럼과 카운터 VER 를 쓴다(규칙표 §2).
 */
@Component
public class MasterCodeDraftDeletion implements VersionDraftDeletionSpi {

    private static final int SCALE = VersionTarget.MASTER_CODE.versionScale();
    private static final List<MasterCodeSegmentTable> TABLES =
            List.of(MasterCodeSegmentTable.ITEM, MasterCodeSegmentTable.CATE_ITEM, MasterCodeSegmentTable.CATE);

    private final EntityManager entityManager;
    private final MdmTemporalBinder temporal;
    private final MdmNativeAuditSupport audit;

    public MasterCodeDraftDeletion(EntityManager entityManager, MdmTemporalBinder temporal, MdmNativeAuditSupport audit) {
        this.entityManager = entityManager;
        this.temporal = temporal;
        this.audit = audit;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.MASTER_CODE;
    }

    @Override
    public void beforeDraftDelete(VersionRef draft) {
        entityManager.flush();
        AuditStamp stamp = audit.currentStamp();
        for (MasterCodeSegmentTable table : TABLES) {
            String name = table.physicalTable();
            query("DELETE FROM " + name + " WHERE MARU_CODE_ID = :objectId AND FROM_VER = :ver", draft).executeUpdate();
            NativeQuery<?> reopen = query("UPDATE " + name + " SET TO_VER = :open, U_USR_ID = :uUsrId, U_AT = :uAt,"
                    + " U_SVC_ID = :uSvcId, U_PGM_ID = :uPgmId, VER = COALESCE(VER, 0) + 1"
                    + " WHERE MARU_CODE_ID = :objectId AND TO_VER = :ver", draft)
                    .setParameter("open", MasterCodeConventions.OPEN_TO_VER.setScale(SCALE))
                    .setParameter("uAt", temporal.toDb(stamp.at()));
            reopen.setParameter("uUsrId", stamp.userId(), String.class);
            reopen.setParameter("uSvcId", stamp.serviceId(), String.class);
            reopen.setParameter("uPgmId", stamp.programId(), String.class);
            reopen.executeUpdate();
        }
    }

    private NativeQuery<?> query(String sql, VersionRef draft) {
        return entityManager.createNativeQuery(sql).unwrap(NativeQuery.class)
                .setParameter("objectId", draft.objectId())
                .setParameter("ver", draft.ver().setScale(SCALE));
    }
}
