package com.dongkuk.dmes.mcm.searchdefaults.service;

import com.dongkuk.dmes.mcm.searchdefaults.entity.SecUserSrchDflt;
import com.dongkuk.dmes.mcm.searchdefaults.repository.SecUserSrchDfltRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 조회 기본값 쓰기의 트랜잭션 경계. OASIS 서비스 빈({@link SecSrchDfltService})에는 {@code @Transactional} 을 붙일 수 없어
 * (CGLIB 프록시가 파라미터명 메타데이터를 잃는다, BackEnd 표준 §6-B-1) 원자성이 필요한 쓰기를 이 빈에 모은다.
 * 위젯 {@code SecWidgetTabWriter} 와 같은 방식이다.
 */
@Component("secSrchDfltWriter")
public class SecSrchDfltWriter {

    /** 검증을 마친 한 칸의 값. */
    public record RowValues(String fieldKey, String ruleJson, String fieldMeta, String fieldLabel) {}

    private final SecUserSrchDfltRepository repository;

    /** 행은 merge(upsert)가 아니라 persist 로 넣어 동시 저장의 PK 충돌을 오류로 드러낸다(조용히 합쳐지지 않는다). */
    @PersistenceContext(unitName = "default")
    private EntityManager em;

    @Autowired
    public SecSrchDfltWriter(SecUserSrchDfltRepository repository) {
        this.repository = repository;
    }

    /** 그 화면의 행을 통째로 바꾼다 — 지우고 다시 넣기. 중간에 실패하면 이전 행이 그대로 남는다(롤백). */
    @Transactional
    public void replacePage(String userId, String pageId, List<RowValues> rows) {
        repository.deleteByUserIdAndPageId(userId, pageId);
        repository.flush();
        for (RowValues r : rows) {
            SecUserSrchDflt e = new SecUserSrchDflt();
            e.setUserId(userId);
            e.setPageId(pageId);
            e.setFieldKey(r.fieldKey());
            e.setRuleJson(r.ruleJson());
            e.setFieldMeta(r.fieldMeta());
            e.setFieldLabel(r.fieldLabel());
            em.persist(e);
        }
        em.flush();
    }

    /** 그 화면의 행을 지운다. 없으면 아무것도 하지 않는다. */
    @Transactional
    public int deletePage(String userId, String pageId) {
        int before = repository.findByUserIdAndPageId(userId, pageId).size();
        repository.deleteByUserIdAndPageId(userId, pageId);
        return before;
    }
}
