package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.entity.MdmCode;
import com.dongkuk.dmes.mdm.entity.MdmCodeCate;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeVer;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * 마루 코드 하나의 04 표 행을 읽는다(TSK-06-03 design.md §2·§3 커밋 A).
 *
 * <p>버전 범위 조건은 JPQL 에 넣지 않는다 — SQLite 는 NUMERIC(7,3) 을 값에 따라 INTEGER·REAL 로 저장하므로(F8) 등치
 * {@code MARU_CODE_ID} 로 모두 읽은 뒤 Java 에서 {@link MasterCodeSegments} 로 거른다. 새 네이티브 SQL 이 없어 방언 차이가
 * 들어올 자리가 없다. 리포지토리 5개에 쿼리를 더하지 않는 것은 형제 Task 와의 충돌을 줄이기 위해서다(F7).
 */
@Component
public class MasterCodeRows {

    private final EntityManager entityManager;

    public MasterCodeRows(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    public Optional<MdmCode> code(String maruCodeId) {
        return Optional.ofNullable(entityManager.find(MdmCode.class, maruCodeId));
    }

    public List<MdmCode> codes() {
        return entityManager.createQuery("select e from MdmCode e order by e.maruCodeId", MdmCode.class).getResultList();
    }

    public List<MdmCodeVer> versions(String maruCodeId) {
        return entityManager.createQuery("select e from MdmCodeVer e where e.maruCodeId = :id", MdmCodeVer.class)
                .setParameter("id", maruCodeId).getResultList();
    }

    public List<MdmCodeItem> items(String maruCodeId) {
        return entityManager.createQuery("select e from MdmCodeItem e where e.maruCodeId = :id", MdmCodeItem.class)
                .setParameter("id", maruCodeId).getResultList();
    }

    public List<MdmCodeCate> cates(String maruCodeId) {
        return entityManager.createQuery("select e from MdmCodeCate e where e.maruCodeId = :id", MdmCodeCate.class)
                .setParameter("id", maruCodeId).getResultList();
    }

    public List<MdmCodeCateItem> cateItems(String maruCodeId) {
        return entityManager.createQuery("select e from MdmCodeCateItem e where e.maruCodeId = :id",
                MdmCodeCateItem.class).setParameter("id", maruCodeId).getResultList();
    }
}
