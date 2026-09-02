package usecase.transactionalSubService;

import com.dongkuk.oasis.audit.AuditHolder;
import com.dongkuk.oasis.utils.MapBuilder;
import org.apache.ibatis.session.SqlSession;

import jakarta.persistence.EntityManagerFactory;

/**
 * @author Jeongjin Kim
 * @since 2021-05-28
 */
public class BasicRepository {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(BasicRepository.class);
    private final SqlSession sqlSession;
    private final EntityManagerFactory entityManagerFactory;

    public BasicRepository(SqlSession sqlSession,
                           EntityManagerFactory entityManagerFactory) {
        this.sqlSession = sqlSession;
        this.entityManagerFactory = entityManagerFactory;
    }

    public void changeFirstName(int userId, String firstName) {
        TestAudit audit = AuditHolder.getAudit();

        int update = sqlSession.update("usecase.transactionalSubService.updateFirstName",
                new MapBuilder<String, Object>()
                        .addEntity("id", userId)
                        .addEntity("firstName", firstName)
                        .addEntity("createdBy", audit == null ? null : audit.getCreateBy())
                        .build());
        log.info("update: {}", update);
    }

//    public List<SampleDto> getSamples() {
//        // 1. mybatis
//        List<SampleEntity> objects = sqlSession.selectList("cothe.selectSamples", null);
//
//        // 2. Jpa
////        List<SampleEntity> objects = entityManager.createQuery("select m from SampleEntity as m", SampleEntity.class).getResultList();
//
//        // 3. Spring Jpa
////        List<SampleEntity> objects = sampleEntityRepository.findAll();
//
//        // data 전환
//        return objects.stream().map(sampleEntity -> new SampleDto(sampleEntity.getId(), sampleEntity.getName())).collect(Collectors.toList());
//    }
}
