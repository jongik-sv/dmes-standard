package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVerId;
import com.dongkuk.dmes.mdm.repository.MdmLayoutVerRepository;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * 레이아웃 버전 이력 읽기·쓰기(TSK-05-03 design.md §2·§6.5). 읽기는 JPQL, 쓰기는 {@code saveAndFlush} 로 명시한다(05-02 I23 — 변경
 * 감지에 기대지 않는다).
 */
@Component
public class LayoutVersionStore {

    private final EntityManager em;
    private final MdmLayoutVerRepository repository;

    public LayoutVersionStore(EntityManager em, MdmLayoutVerRepository repository) {
        this.em = em;
        this.repository = repository;
    }

    public Optional<MdmLayoutVer> latest(Long layoutId) {
        return em.createQuery("SELECT v FROM MdmLayoutVer v WHERE v.layoutId = :id ORDER BY v.layoutVersion DESC", MdmLayoutVer.class)
                .setParameter("id", layoutId).setMaxResults(1).getResultList().stream().findFirst();
    }

    /** 최신부터. */
    public List<MdmLayoutVer> history(Long layoutId) {
        return em.createQuery("SELECT v FROM MdmLayoutVer v WHERE v.layoutId = :id ORDER BY v.layoutVersion DESC", MdmLayoutVer.class)
                .setParameter("id", layoutId).getResultList();
    }

    public Optional<MdmLayoutVer> find(Long layoutId, Long version) {
        return repository.findById(new MdmLayoutVerId(layoutId, version));
    }

    public MdmLayoutVer save(MdmLayoutVer v) {
        return repository.saveAndFlush(v);
    }
}
