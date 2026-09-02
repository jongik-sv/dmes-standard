package com.dongkuk.dmes.cactus.jpa;

import com.dongkuk.dmes.cactus.datasource.CactusMultiDataSourceAutoConfiguration;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.cfg.AvailableSettings;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.BeanFactory;
import org.springframework.beans.factory.BeanFactoryAware;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;
import org.springframework.beans.factory.support.GenericBeanDefinition;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

import javax.sql.DataSource;
import java.util.HashMap;
import java.util.Map;

/**
 * cactus.jpa.extras 의 각 entry 별 EntityManagerFactory + JpaTransactionManager 빈 동적 등록
 * (1.0.21-SNAPSHOT 신규).
 *
 * <p>빈 이름:
 * <ul>
 *   <li>EMF: {@code cactusEntityManagerFactory{Name}}</li>
 *   <li>TxMgr: {@code cactusTransactionManager{Name}}</li>
 * </ul>
 *
 * <p>각 EMF 는 동일 entry name 의 DataSource alias 를 lookup
 * ({@link CactusMultiDataSourceAutoConfiguration} 가 yml-key alias 등록).
 *
 * <p>{@code cactus.datasource.extras} 에는 정의됐으나 {@code cactus.jpa.extras} 에 entry 가 없는 DS 는
 * EMF/JpaTxMgr 등록 안 됨 — Phase 4 에서 {@code DataSourceTransactionManager} fallback 처리.
 *
 * <p>1.0.21 호환성: {@link CactusSecondaryJpaAutoConfiguration} (deprecated) 와 공존. 1.0.22 제거 예정.
 */
@AutoConfiguration(after = CactusMultiDataSourceAutoConfiguration.class)
@ConditionalOnClass({EntityManagerFactory.class, LocalContainerEntityManagerFactoryBean.class})
public class CactusMultiJpaAutoConfiguration
        implements BeanDefinitionRegistryPostProcessor, EnvironmentAware, BeanFactoryAware {

    private static final Logger log = LoggerFactory.getLogger(CactusMultiJpaAutoConfiguration.class);

    private CactusJpaProperties jpaProps;
    private BeanFactory beanFactory;

    @Override
    public void setEnvironment(Environment environment) {
        this.jpaProps = Binder.get(environment)
                .bind("cactus.jpa", CactusJpaProperties.class)
                .orElseGet(CactusJpaProperties::new);
    }

    @Override
    public void setBeanFactory(BeanFactory beanFactory) throws BeansException {
        this.beanFactory = beanFactory;
    }

    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) throws BeansException {
        if (jpaProps == null || jpaProps.getExtras().isEmpty()) return;

        for (Map.Entry<String, CactusJpaProperties.ExtrasJpa> entry : jpaProps.getExtras().entrySet()) {
            String name = entry.getKey();
            CactusJpaProperties.ExtrasJpa cfg = entry.getValue();
            String emfBeanName = "cactusEntityManagerFactory" + capitalize(name);
            String txBeanName = "cactusTransactionManager" + capitalize(name);

            GenericBeanDefinition emfBd = new GenericBeanDefinition();
            emfBd.setBeanClass(EntityManagerFactory.class);
            emfBd.setInstanceSupplier(() -> buildEmf(name, cfg));
            emfBd.setPrimary(false);
            emfBd.setDestroyMethodName("close");
            registry.registerBeanDefinition(emfBeanName, emfBd);

            GenericBeanDefinition txBd = new GenericBeanDefinition();
            txBd.setBeanClass(JpaTransactionManager.class);
            txBd.setInstanceSupplier(() -> {
                EntityManagerFactory emf = beanFactory.getBean(emfBeanName, EntityManagerFactory.class);
                return new JpaTransactionManager(emf);
            });
            txBd.setPrimary(false);
            registry.registerBeanDefinition(txBeanName, txBd);

            log.info("[Cactus] extras EMF + TxMgr — name='{}' emf='{}' tx='{}' packages={}",
                    name, emfBeanName, txBeanName, cfg.getPackagesToScan());
        }
    }

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
        // no-op
    }

    private EntityManagerFactory buildEmf(String name, CactusJpaProperties.ExtrasJpa cfg) {
        DataSource ds = beanFactory.getBean(name, DataSource.class);

        LocalContainerEntityManagerFactoryBean emf = new LocalContainerEntityManagerFactoryBean();
        emf.setDataSource(ds);
        // packages-to-scan 이 비어 있어도 빈 배열로 항상 setPackagesToScan 을 호출한다.
        // 호출하지 않으면 (persistenceUnitName 만 설정된 채) Spring 이 persistence.xml 에서
        // 해당 유닛을 찾으려다 "No persistence unit with name '...' found" 로 부팅 실패.
        // 빈 배열을 넘기면 패키지 스캔 모드로 엔티티 0개짜리 유닛을 persistenceUnitName 이름으로
        // 생성하므로, 매핑할 엔티티가 없는 extras DS(예: 'if') 도 정상 부팅된다.
        emf.setPackagesToScan(cfg.getPackagesToScan() != null
                ? cfg.getPackagesToScan().toArray(new String[0])
                : new String[0]);
        emf.setPersistenceUnitName(cfg.getPersistenceUnitName() != null
                ? cfg.getPersistenceUnitName()
                : "cactus-" + name);
        emf.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        emf.setPersistenceProviderClass(HibernatePersistenceProvider.class);

        Map<String, Object> props = new HashMap<>();
        CactusJpaProperties.ExtrasJpa.Hibernate h = cfg.getHibernate();
        if (h.getDialect() != null && !h.getDialect().isBlank()) {
            props.put(AvailableSettings.DIALECT, h.getDialect());
        }
        if (h.getDdlAuto() != null && !h.getDdlAuto().isBlank()) {
            props.put(AvailableSettings.HBM2DDL_AUTO, h.getDdlAuto());
        }
        props.put(AvailableSettings.SHOW_SQL, Boolean.toString(h.isShowSql()));
        // 네이밍 전략은 '인스턴스'로 주입한다. PrefixedSnakePhysicalNamingStrategy(String) /
        // CactusImplicitNamingStrategy(String,String,String) 은 no-arg 생성자가 없어 클래스명 문자열로
        // 넣으면 Hibernate StrategySelector 가 newInstance() 호출 시 NoSuchMethodException 으로 부팅 실패한다.
        // (CactusHibernateCustomizerAutoConfiguration 가 primary EMF 에 적용하는 방식과 동일하게 인스턴스 사용.)
        if (jpaProps.getSnakeNaming().isEnabled()) {
            String prefix = jpaProps.getTablePrefix();
            if (prefix != null && !prefix.isBlank()) {
                props.put(AvailableSettings.PHYSICAL_NAMING_STRATEGY,
                        new PrefixedSnakePhysicalNamingStrategy(prefix));
            } else {
                props.put(AvailableSettings.PHYSICAL_NAMING_STRATEGY,
                        new SnakePhysicalNamingStrategy());
            }
        }
        if (jpaProps.getImplicitNaming().isEnabled()) {
            CactusJpaProperties.ImplicitNaming implicitCfg = jpaProps.getImplicitNaming();
            props.put(AvailableSettings.IMPLICIT_NAMING_STRATEGY,
                    new CactusImplicitNamingStrategy(
                            implicitCfg.getUkPrefix(), implicitCfg.getIdxPrefix(), jpaProps.getTablePrefix()));
        }
        props.putAll(h.getProperties());
        emf.setJpaPropertyMap(props);

        emf.afterPropertiesSet();
        return emf.getObject();
    }

    private static String capitalize(String s) {
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
