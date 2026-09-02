package usecase.multiDataSource;

import com.dongkuk.oasis.transaction.JpaExecutionTemplate;
import org.apache.ibatis.session.SqlSession;

import jakarta.persistence.EntityManagerFactory;
import java.util.List;
import java.util.stream.Collectors;

/**
 * @author Jeongjin Kim
 * @since 2021-05-28
 */
public class UserSignInRepository {
    private final SqlSession sqlSession;
    private final EntityManagerFactory entityManagerFactory;

    public UserSignInRepository(SqlSession sqlSession,
                                EntityManagerFactory entityManagerFactory) {
        this.sqlSession = sqlSession;
        this.entityManagerFactory = entityManagerFactory;
    }

    public void signIn(UserDto userDto) {
        new JpaExecutionTemplate(entityManagerFactory).execute(entityManager -> {
            UserEntity userEntity = new UserEntity(userDto.getId(), userDto.getFirstName(), userDto.getLastName());
            entityManager.persist(userEntity);
        });
    }

    public List<UserDto> users() {
        List<UserEntity> objects = sqlSession.selectList("usecase.multiDataSource.selectUsers", null);
        return objects.stream().map(userEntity -> new UserDto(
                userEntity.getId(),
                userEntity.getFirstName(),
                userEntity.getLastName())
        ).collect(Collectors.toList());
    }

    public UserDto user(UserDto userDto) {
        List<UserEntity> objects = sqlSession.selectList("usecase.multiDataSource.selectUser", userDto);
        return new UserDto(objects.get(0).getId(), objects.get(0).getFirstName(), objects.get(0).getLastName());
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
