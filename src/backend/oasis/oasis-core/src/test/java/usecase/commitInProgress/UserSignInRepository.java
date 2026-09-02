package usecase.commitInProgress;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-05-28
 */
@SuppressWarnings({"SqlResolve", "unused"})
public class UserSignInRepository {
    private static final Logger log = LoggerFactory.getLogger(UserSignInRepository.class);
    private final NamedParameterJdbcTemplate jdbcTemplate;

    public UserSignInRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void signIn(String id, String firstName, String lastName) {
        Map<String, Object> param = new HashMap<>();
        param.put("id", id);
        param.put("firstName", firstName);
        param.put("lastName", lastName);
        jdbcTemplate.update("insert into users(id, firstName, lastName) values(:id, :firstName, :lastName)", param);
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
