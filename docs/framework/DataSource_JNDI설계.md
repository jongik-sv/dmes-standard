# DMES MCM â ë©í° íê²½ DataSource / WildFly JNDI ì í ì¤ê³ì

> **DB 전제 안내 (2026-10-03)**: 이 문서의 SQL Server 와 `java:/jdbc/mssql/{모듈}/{DS}` JNDI 이름은 코드의 실제 설정이며 dmes-ksm(MSSQL) 이관 시절 것이다. 운영 대상은 Oracle 또는 PostgreSQL 이고 MSSQL 은 거의 쓰지 않으므로, 운영 전에 방언·JNDI 이름·드라이버를 바꿔야 한다. 참고로 이 파일은 본문이 깨진 인코딩(UTF-8 이중 변환)으로 저장되어 있어 읽으려면 다시 변환해야 한다.

> ⚠ **êµ¬í ë°ì ë¬¸ì**: WildFly JNDI DataSource ì í ì¤ê³ + êµ¬í ê¸°ë¡. mcm·caravan-hub(§11)·mqc/mpp/mpn/mls(§12)는 코드 적용 완료(미커밋), WildFly 배포 검증 진행 중 — 현행 구현과 함께 참고한다.

> ì¼ì: 2026-06-24 11:23 (ê°ì : 2026-07-02 â 6-íë¡íì¼ êµ¬ì¡°ë¡ ì¬ì¤ê³ / 2026-07-07 â ìí¥ë ë¶ì ê²°ê³¼ ë°ì: cactus-core ë³´ì 2ê±´Â·mcm íë¡íì¼ ë¦¬í°ë´ 2ê³³Â·ëë¼ì´ë² coreâapi ì´ëÂ·init ê²ì´í¸Â·ê¸°ë³¸ íë¡íì¼ í´ë°±)
> íë¡ì í¸: dmes-aps (MES ë¼ì°í° / cactus-core ê³µíµ ì¸íë¼)
> ìì ëë í ë¦¬: D:\dmes-standard\workspace-ksm\dmes-aps
> ì ì© ì°ì ìì: **MCM ëª¨ë ë¨¼ì  ì ì©**
> ìí: ì¤ê³(ì½ë ë¯¸ìì ). ë³¸ ë¬¸ì ì¹ì¸ í êµ¬í ì°©ì.

---

## 0. ë¬¸ì ëª©ì 

**ê°ë°ìë² 2ê³³(í¬í­Â·ê¹í¬) + ì´ì 1ê³³** ì ë¨ì¼ WAR ì°ì¶ë¬¼ë¡ ì´ì©íê¸° ìí DataSource êµ¬ì± ì¤ê³.
ë¡ì»¬ ê°ë°(bootRun)ì **JNDIë¥¼ ì°ì§ ìê³  DataSource ì§ê²°**, WildFly ë°°í¬ íê²½ë§ JNDIë¥¼ ì¬ì©íë¤.

| profile | íê²½ | DB | ì¤í ë°©ì | ì»¤ë¥ì ê´ë¦¬ | JNDI |
|---------|------|----|----------|-----------|------|
| **local** | ê°ë°ì ë¡ì»¬ | **SQLite** | `bootRun`(ë´ì¥ Tomcat) | ì± ì§ì (HikariCP) | â |
| **local-ph** | ê°ë°ì ë¡ì»¬ â **í¬í­ ê°ë° DB** | SQL Server | `bootRun`(ë´ì¥ Tomcat) | ì± ì§ì (HikariCP) | â |
| **local-kp** | ê°ë°ì ë¡ì»¬ â **ê¹í¬ ê°ë° DB** | SQL Server | `bootRun`(ë´ì¥ Tomcat) | ì± ì§ì (HikariCP) | â |
| **dev** | **í¬í­Â·ê¹í¬ ê°ë°ê³** | SQL Server | WildFly(WAR) | WildFly(IronJacamar) | â |
| **prod** | **ê¹í¬ ì´ìê³** | SQL Server | WildFly(WAR) | WildFly(IronJacamar) | â |

íµì¬ ì ë¦¬
- **local ê³ì´ 3ê°(local / local-ph / local-kp) = ì± ì§ê²°(Hikari)**. JNDI ë¯¸ì¬ì©.
  - `local` = SQLite, `local-ph` = í¬í­ ê°ë° DB ì§ê²°, `local-kp` = ê¹í¬ ê°ë° DB ì§ê²°.
  - local-ph/local-kp ë ê°ë°ìê° ë¡ì»¬ìì ì¤ì  ê°ë° DBë¥¼ ë³´ë©° ê°ë°/ëë²ê¹íë ì©ë.
- **WildFly ê³ì´ 2ê°(dev / prod) = JNDI**.
  - `dev` **íëì íë¡íì¼ì í¬í­Â·ê¹í¬ ë WildFlyì ê³µíµ ë°°í¬**íë¤. ë ê°ë°ê³ë íê²½ì´ ê±°ì ëì¼íë¯ë¡ íë¡íì¼ì ëëì§ ìëë¤(Â§1 ìì¹3).
  - JNDI **ë¼ë¦¬ ì´ë¦ì ëª¨ë  WildFlyìì ëì¼**, **ë¬¼ë¦¬ ì ìì ë³´ë§ ê° WildFlyê° ë¤ë¥´ê²** ë³´ì íë¤.

> **ì ë¡ì»¬ì JNDIë¥¼ ì ì°ë** â bootRun ë´ì¥ Tomcatìë ì»¨íì´ëê° ë±ë¡í JNDI DataSource(`java:jboss/...`, `java:comp/env/...`)ê° **ì¡´ì¬íì§ ìëë¤**. ìµì§ë¡ ì°ë ¤ë©´ ë¶í ì JNDI ì»¨íì¤í¸ë¥¼ ì½ëë¡ ë±ë¡í´ì¼ íë©° ì´ëì´ ìë¤. ë¡ì»¬ì Hikari ì§ê²°ì´ ë¨ìíê³  ì ëµì´ë¤.

---

## 1. ì¤ê³ 4ë ìì¹

### ìì¹ 1 â í ì½ë, ë ê²½ë¡ (jndi-name ì ë¬´ë¡ ë¶ê¸°)
DataSourceë¥¼ ìì±íë ë¨ ë ì§ì ìì `jndi-name` íë¡í¼í° ì¡´ì¬ ì¬ë¶ë¡ ë¶ê¸°íë¤.
- `jndi-name` **ìì** â `JndiDataSourceLookup` (WildFly: dev/prod)
- `jndi-name` **ìì** â `HikariDataSource` ì§ê²° (local / local-ph / local-kp)

â ë¡ì»¬ ê°ë°(bootRun) 3ê° íë¡íì¼ì **JNDI ë¬´ìí¥**ì¼ë¡ Hikari ì§ê²°ì ê·¸ëë¡ ì¬ì©íë¤.

### ìì¹ 2 â Build Once, Deploy Anywhere (WAR íì )
`mcm.war`ë íê²½ì ë¬´ê´íê² **ëì¼ ì°ì¶ë¬¼**ì´ë¤. **WildFly ë°°í¬ íê²½(dev/prod)** ì ë¬¼ë¦¬ ì ìì ë³´(ìë² IP/ê³ì /ë¹ë°ë²í¸/í í¬ê¸°)ë WARê° ìëë¼ **ê° WildFlyì standalone.xml**ì´ ìì íë¤. íê²½ ì í = ë¤ë¥¸ WildFlyì ë°°í¬ + `-Dspring.profiles.active` ë³ê²½ë¿.

> local-ph/local-kp ì ì§ê²° ì ìì ë³´ë **ê°ë°ì bootRun ì ì©**ì¼ë¡ ì± ymlì ì¡´ì¬íë¤. ì´ë WAR ì°ì¶ë¬¼ì´ ìëë¼ ë¡ì»¬ ì¤í í¸ìê°ì´ë¯ë¡ "Build Once"(WAR) ìì¹ê³¼ ì¶©ëíì§ ìëë¤. ë¨, ì¤ì  ê³ì /ë¹ë²ì´ ymlì ë¤ì´ê°ë¯ë¡ Â§10 ë³´ì í­ëª© ì°¸ì¡°.

### ìì¹ 3 â ëì¼ ë¼ë¦¬ëª, íê²½ë³ ë¬¼ë¦¬ ë§¤í (dev ë¨ì¼ íë¡íì¼)
JNDI ë¼ë¦¬ ì´ë¦(`java:/jdbc/mssql/mcm/dsBiz`)ì **í¬í­Â·ê¹í¬Â·ì´ì WildFlyìì ëª¨ë ëì¼**. ê°ì ì´ë¦ì´ íê²½ë§ë¤ ë¤ë¥¸ ë¬¼ë¦¬ DBë¥¼ ê°ë¦¬í¨ë¤. ë¼ë¦¬ ì´ë¦ì **ìì¤í íë¡í¼í°/íê²½ë³ìë¡ override ê°ë¥íë íì¤ ê¸°ë³¸ê°ì ëë¤**(Â§2-1, Â§4-3).
â í¬í­Â·ê¹í¬ ê°ë°ê³ë DataSource ê´ì ìì ìì í ëì¼íê³  DB ì¸ íê²½ ì°¨ì´ë ê±°ì ìì¼ë¯ë¡ **`dev` ë¨ì¼ íë¡íì¼ì ë WildFlyì ê³µíµ ë°°í¬**íë¤. ì´ìë§ `prod` ë¡ ë¶ë¦¬íë¤.

### ìì¹ 4 â í¸ëì­ìì resource-local ì ì§ (`jta=false`)
íí DataSourceë³ TxMgr(`txBiz/txCmn/txIF/txCaravan`, resource-local) êµ¬ì¡°ë¥¼ ì ì§íë¤. WildFly DataSourceë¥¼ ë°ëì **`jta="false"`** ë¡ ì ìí´ ì»¨íì´ë JTA enlistë¥¼ ë§ëë¤(ë¯¸ì¤ì  ì Spring resource-local í¸ëì­ìê³¼ ì¶©ë). ë¶ì° 2PCë ëìíì§ ìëë¤(ì¸ ì¤í¤ë§ê° ëì¼ ë¬¼ë¦¬ DBì´ê³  íí ì¤ê³ê° ì´ë¯¸ ë¹ìì ì ì ).

---

## 2. MCM DataSource ì¸ë²¤í ë¦¬

MCMì 4ê° DataSourceë¥¼ ì¬ì©íë¤. ë¨ì¼ ë¬¼ë¦¬ DB(`ksm_dmes`)ìì **ê³ì (USER)=ì¤í¤ë§ë¡ ë¶ë¦¬**íë¤. `biz/cmn/if` ë **ì  ëª¨ë íì¤ 3ì¢**(íì¤ tx `txBiz/txCmn/txIF` ëì), `caravan` ì MCM íì¥ì´ë¤.

| ë¼ë¦¬(alias) | ì­í  | ê³ì (ì¤í¤ë§) | override íë¡í¼í° | JNDI ê¸°ë³¸ê°(WildFly ê³µíµ) | local(SQLite) |
|------|------|-----------|------------------|------------------|---------------|
| **biz** (primary) | MCM ë¹ì¦ëì¤ ìì¥ | MCMAPUSER | `JNDI_DS_BIZ` | `java:/jdbc/mssql/mcm/dsBiz` | `../data/mcm.db` |
| **cmn** | ê³µíµ(íì¤ 3ì¢) | MCMAPUSER | `JNDI_DS_CMN` | `java:/jdbc/mssql/mcm/dsCmn` | `../data/mcm.db` |
| **if** | ì¸í°íì´ì¤ ì¡ìì  | EAIUSER | `JNDI_DS_IF` | `java:/jdbc/mssql/mcm/dsIF` | `../data/serai-if.db` |
| **caravan** | Kafka ë©í(Serai) | CARAVANUSER | `JNDI_DS_CARAVAN` | `java:/jdbc/mssql/mcm/dsCaravan` | `../data/serai-caravan.db` |

> **cmn ëì(2026-07-02)** â í ëª¨ëì´ cmn ì íì¤ì¼ë¡ ì°ë¯ë¡ MCM ë **íµì¼**íë¤. ííì "`txCmn`âbiz alias(cmn ì ì)" ë°©ìì íê¸°íê³ , cmn ì ëë¦½ DataSource ë¡ ëì´ **`txCmn`âcmn** ì¼ë¡ ì¬ë°°ì íë¤.
> MCM ìì cmn ì ë¬¼ë¦¬ ê³ì ì **biz ì ëì¼ `MCMAPUSER`**(ê³µíµ ë°ì´í°ê° ì± ì¤í¤ë§ì ìì£¼). local(SQLite)ë biz ì ëì¼ `mcm.db` íì¼ì ê³µì íë¤. â *cmn ì´ ë³ë ê³ì /DB ë¥¼ ì¨ì¼ íë¤ë©´ ì´ íì Â§4Â·Â§5 ë¥¼ ì¡°ì .*

### 2-1. JNDI ì´ë¦ ê·ì½ (override + íì¤ ê¸°ë³¸ê°)

- **ëªëª ê·ì¹**: `java:/jdbc/mssql/{ëª¨ëëª}/{DSëª}` (ì: `java:/jdbc/mssql/mcm/dsBiz`).
  - WildFly ë datasource `jndi-name` ì´ ë°ëì `java:/` ëë `java:jboss/` ë¡ ììí´ì¼ íë¤(ë¯¸ì¤ì ì ë¶í ì `WFLYJCA0117` ê±°ë¶). â ì ëì´ `java:/` íì.
  - Spring `JndiDataSourceLookup` ì ì ì ëëªì ê·¸ëë¡ ì¡°ííë¯ë¡ ì±Â·ì»¨íì´ë ììª½ì´ ëì¼ ì´ë¦ì ê³µì .
- **override ë°©ì**: yml ê°ì `${PROP:ê¸°ë³¸ê°}` íë ì´ì¤íëë¡ ëì´, ê¸°ë³¸ê°(íì¤ ì´ë¦)ì¼ë¡ ê·¸ëë¡ ëìíë íì ì ìì¤í íë¡í¼í°/íê²½ë³ì(`JNDI_DS_BIZ` ë±)ë¡ë§ ë®ì´ì´ë¤. **ìì íë¡í¼í°(ê¸°ë³¸ê° ìì´) ê¸ì§** â ë¯¸ì£¼ì ì ë¶í ì¤í¨.
- WildFly standalone.xml ì `jndi-name` ë ëì¼ ê·ì½(ê¸°ë³¸ê°)ì¼ë¡ ì ìíë¤.
- **ëª¨ë ê° íµì¼**: íì¤ 3ì¢ `dsBiz/dsCmn/dsIF` + (ëª¨ëë³ íì¥). override íë¡í¼í°ë `JNDI_DS_BIZ/JNDI_DS_CMN/JNDI_DS_IF/â¦` ë¡ ì  ëª¨ë ëì¼ ê·ì½ì ì´ë¤. `{ëª¨ëëª}` ë§ ë°ëë¤(mcm â `java:/jdbc/mssql/mcm/dsCmn`, í ëª¨ë â `java:/jdbc/mssql/{ê·¸ëª¨ë}/dsCmn`).

---

## 3. ì½ë ë³ê²½ ì¤ê³ (3ê° ë³ê²½ì )

### 3-1. cactus-core â extrasì© JNDI ë¶ê¸° (ì¬ì¬ì© ê³µíµ ì¸íë¼)

**íì¼**: `src/backend/cactus-core/.../datasource/CactusDataSourceProperties.java`
â `DataSourceProps`ì íë ì¶ê°:
```java
/** WildFly ë± ì¸ë¶ ì»¨íì´ë ê´ë¦¬ DataSourceì JNDI ì´ë¦. ì¤ì  ì url/username/password/driver ë¬´ìíê³  JNDI lookup. */
private String jndiName;
// getter/setter
```

**íì¼**: `src/backend/cactus-core/.../datasource/CactusMultiDataSourceAutoConfiguration.java`
â `buildHikari` í¸ì¶ë¶ë¥¼ ë¶ê¸° ë©ìëë¡ êµì²´:
```java
private DataSource buildDataSource(CactusDataSourceProperties.DataSourceProps p, String poolName) {
    if (p.getJndiName() != null && !p.getJndiName().isBlank()) {
        // WildFly(dev/prod): ì»¨íì´ë ê´ë¦¬ íì JNDIë¡ ì¡°í
        return new org.springframework.jdbc.datasource.lookup.JndiDataSourceLookup()
                .getDataSource(p.getJndiName());
    }
    // local / local-ph / local-kp: ê¸°ì¡´ HikariCP ì§ê²°
    return buildHikari(p, poolName);
}
```
â `registerExtra()`ìì `buildHikari(...)` ëì  `buildDataSource(...)` í¸ì¶. **íìí¸í**: jndiName ë¯¸ì¤ì ì´ë©´ ê¸°ì¡´ ëì 100% ëì¼(ë¤ë¥¸ ëª¨ë/ë¡ì»¬ ë¬´ìí¥).

**â ï¸ ìí¥ë ë¶ì(2026-07-07)ì¼ë¡ íì¸ë ì¶ê° ìì  2ê±´ â ë¶ê¸°ë§ì¼ë¡  ë¶ì¡±:**

1. **ë¹ ì ì íëì½ë© ë¶ê¸°**: `CactusMultiDataSourceAutoConfiguration.postProcessBeanDefinitionRegistry` ì extras ë±ë¡ë¶ê° `bd.setBeanClass(HikariDataSource.class)`(L76) + `bd.setDestroyMethodName("close")`(L79) ë¥¼ íëì½ë©íë¤. jndiName ê²½ë¡ììë:
   - `beanClass` ë¥¼ `javax.sql.DataSource` ë¡ ì¤ì 
   - **`destroyMethodName` ì ì¤ì íì§ ìì** (ì¤ì  ì ì± ì§ë¤ì´ ë Spring ì´ WildFly **ì»¨íì´ë ê´ë¦¬ íì close** íë ¤ ìë â ì»¨íì´ë í íê´´/ìë¬)
2. **MyBatis ìëì¤ì  íì± ì¡°ê±´ ìí**: `CactusMultiMybatisAutoConfiguration` ì `sqlSessionFactory{If,Cmn,...}`/`sqlSessionTemplate{...}` ë¹ì´ `@ConditionalOnProperty(prefix="cactus.datasource.extras.<alias>", name="url")` ë¡ ê²ì´í¸ëì´ ìë¤(L104, L115). **jndi-name ë§ ì¤ì ë extras ë url ì´ ìì´ SqlSessionFactory/Template ì´ ìì±ëì§ ìê³ **, OASIS `CactusMultiMyBatisSqlRunner.resolveSession` ì´ "No SqlSessionTemplate matching DataSource" ë°íì ìì¸ë¥¼ ëì§ë¤(L122-124). â ì¡°ê±´ì **`url` OR `jndi-name`** ì¼ë¡ ìí(ì»¤ì¤í Condition ëë `@ConditionalOnExpression`).

> ì°¸ê³ (ìì  ë¶ì íì¸): cactus-core ì DataSource ë¥¼ Hikari ë¡ ìºì¤í/close/ë©í¸ë¦­ ë±ë¡íë ìë¹ ì½ëë ìì â ì 2ê±´ë§ ê³ ì¹ë©´ JNDI DataSource ê° EMF/TxMgr/MyBatis/OASIS ì  ìë¹ì¸µì ìì íê² íë¥¸ë¤. `@ConditionalOnClass(HikariDataSource.class)`(L39) ê²ì´í¸ê° ìì¼ë¯ë¡ HikariCP ìì¡´ì±ì í´ëì¤í¨ì¤ì ì ì§í  ê²(local ì§ê²°ìë íì).

### 3-2. mcm host â primary(biz) JNDI ë¶ê¸°

**íì¼**: `src/backend/mcm/api/.../config/JpaConfig.java`
```java
@Bean @Primary
public DataSource dataSource(Environment env) {
    String jndiName = env.getProperty("spring.datasource.jndi-name");
    if (jndiName != null && !jndiName.isBlank()) {
        return new JndiDataSourceLookup().getDataSource(jndiName);   // WildFly ê²½ë¡(dev/prod)
    }
    // ê¸°ì¡´ HikariDataSource ë¹ë ë¡ì§ ì ì§ (local / local-ph / local-kp)
    HikariDataSource ds = new HikariDataSource();
    ... // íí ê·¸ëë¡
    ds.setPoolName("mcm-host-primary");
    return ds;
}
```

### 3-3. build.gradle â ëë¼ì´ë² ìì¡´ì± ì´ë (core â api)

**íì (ìí¥ë ë¶ì 2026-07-07)**: íí ì ì¸ì `src/backend/mcm/lib/build.gradle`(êµ¬ :core â rename ë°ì) ì `api 'com.microsoft.sqlserver:mssql-jdbc:12.8.1.jre11'`. **`:lib`(êµ¬ :core) ì java-library ë¼ `providedRuntime` ì¤ì ì´ ì¡´ì¬íì§ ìëë¤**(war íë¬ê·¸ì¸ ì ì©). ë¨ì ì¤ì½í ë³ê²½ ë¶ê° â **ìì¡´ì±ì `:api` ë¡ ì´ë**íë¤.

- **`mcm/lib/build.gradle`**(êµ¬ core): `api 'mssql-jdbc'` ë¼ì¸ **ì ê±°**. `sqlite-jdbc`/`hibernate-community-dialects` ë íí ì ì§(local bootRun íì).
- **`mcm/api/build.gradle`**: `providedRuntime` ë¡ ì¬ì ì¸ (ì´ë¯¸ tomcat-embed 3ì¢ì´ ê°ì í¨í´ì¼ë¡ ì ì¸ë¼ ìì L20-22):
```gradle
dependencies {
    // ... ê¸°ì¡´ ...
    providedRuntime 'org.apache.tomcat.embed:tomcat-embed-core'        // ê¸°ì¡´
    providedRuntime 'com.microsoft.sqlserver:mssql-jdbc:12.8.1.jre11'  // ì¶ê° â WildFly ëª¨ëì´ ì ê³µ, WAR ì ì¸(ì´ì¤ í´ëì¤ë¡ë ì¶©ë ë°©ì§)
}
```
> â ï¸ **local-ph / local-kp ë mssql-jdbc ê° íìíë¤.** Gradle `war` íë¬ê·¸ì¸ì `providedRuntime` ë **runtimeClasspath ì í¬í¨ëë¯ë¡ bootRun í´ëì¤í¨ì¤ìë ê·¸ëë¡ ë¨ëë¤**(WAR ìì¹´ì´ë¸ììë§ ì ì¸). ë°ë¼ì ë¡ì»¬ SQL Server ì§ê²°(local-ph/local-kp)ì ë¬¸ì ìê³ , WARììë§ ëë¼ì´ë²ê° ë¹ ì§ë¤.
> ì°¸ê³ : war íë¬ê·¸ì¸(`mcm/api/build.gradle:3`) + `SpringBootServletInitializer`(`ServletInitializer.java`) + `bootWar â mcm.war` ë **ì´ë¯¸ êµ¬ì±ë¼ ìì** â WAR ë°°í¬ ì¤ë¹ ìë£ ìí.

### 3-4. mcm ì½ë ëë° ìì  â íë¡íì¼ëª ë¦¬í°ë´ 2ê³³ (â ìí¥ë ë¶ì ë°ê²¬)

íë¡íì¼ ê°ëª(`mssql`â`local-ph`, `dev`â`local-kp`/JNDIí)ì íëì½ë©ì¼ë¡ ê²°í©ë **ì¤í ì½ë**ê° 2ê³³ ìë¤. yml ê°ëªê³¼ **ë°ëì ëìì** ìì íë¤.

1. **`McmApplication.java:71`** â `profiles.contains("local") && !profiles.contains("mssql")` ì¡°ê±´ì¼ë¡ SQLite extras ê²½ë¡ override ë¥¼ ê²ì´í¸. `mssql` íê¸° í `!contains("mssql")` ì´ í­ì ì°¸ â íë¡íì¼ ì¡°í©ì ë°ë¼ MSSQL ì¤íì SQLite override ê° ì¤ë°ë ê°ë¥. **ì  ì²´ê³ ê¸°ì¤ì¼ë¡ ì¬ìì±**(ì: `local` ë¨ë íì±ì¼ ëë§ override â MSSQL ì§ê²°/JNDI íë¡íì¼(`local-ph`/`local-kp`/`dev`/`prod`) ë¶ì¬ ì¡°ê±´).
2. **`DataInitializer.java:2579`** â ìí ìë(RuleMaster) ê²ì´í¸ê° `p.equals("local") || p.equals("mssql") || p.equals("dev")` ë¦¬í°ë´. ê°ëª í `local-ph`/`local-kp` ìì ìëê° **ì¡°ì©í ì¤ë¨**ëê³ , ì  `dev`(WildFly JNDI)ììë **ìëì¹ ìê² ìë ëì**ì´ ëë¤. â ì  ì´ë¦ì¼ë¡ ì¬ìì± + ìë íì© í°ì´ ì¬ê²°ì (ê¶ì¥: `local`/`local-ph`/`local-kp` ë§, WildFly ê³ì´ ì ì¸).

> ê·¸ ì¸ íë¡íì¼ ê²°í© ìì(ì ì íì¸): `@Profile` ì ëíì´ì 0ê±´, íì¤í¸ `@ActiveProfiles` 0ê±´, ì¸/CI/IDE ë°ì¤ì  0ê±´. ë¬¸ì 2ê±´ë§ ê°±ì  ëì(Â§7 Phase B ì°¸ê³ ).

> **ë³ê²½ ë²ì ìì½(ê°ì )**: DataSource ë¥¼ *ë§ëë* 2ì§ì (Â§3-1Â·Â§3-2) + cactus-core ë³´ì 2ê±´(Â§3-1 ë¹ì ì/MyBatis ì¡°ê±´) + ëë¼ì´ë² ì´ë(Â§3-3) + mcm íë¡íì¼ ë¦¬í°ë´ 2ê³³(Â§3-4). EMF/TxMgr/OASIS ë ìì±ë DataSource ë¹ì ìë¹ë§ íë¯ë¡ ë¬´ìì .
> **txCmn ì¬ë°°ì  ìì ì± íì¸(2026-07-07)**: mcm/mcm-core ì ì²´ì `@Transactional("txCmn")` ë° BPMN `tx="txCmn"` ì¬ì©ì² **0ê±´**(ëª¨ë  ì°ê¸°ë OASIS default-manager txBiz / ë¬´íì  @Transactional ê²½ì ) â Â§4-2 ì txCmnâcmn ì¬ë°°ì ì ê¸°ì¡´ ë¹ì¦ëì¤ ë¡ì§ì í¸ëì­ì ìë¯¸ë¥¼ ë°ê¾¸ì§ ìëë¤.

---

## 4. yml íë¡íì¼ êµ¬ì¡° ì¤ê³

### 4-1. íì¼ í¸ë¦¬ (mcm/api/src/main/resources)
```
application.yml             # base: cactus êµ¬ì¡° + íë¡íì¼ ê·¸ë£¹. ì ìì ë³´ ìì
application-local.yml       # SQLite ì§ê²° (Hikari). íí ì ì§
application-local-ph.yml    # í¬í­ ê°ë° DB ì§ê²° (Hikari). â íí application-mssql.yml ì ê°ëª/ì´ê´
application-local-kp.yml    # ê¹í¬ ê°ë° DB ì§ê²° (Hikari). â íí application-dev.yml ì ê°ëª/ì´ê´
application-wildfly.yml     # â JNDI datasource ë¸ë¡ (dev/prod ê³µíµ)
application-dev.yml         # í¬í­Â·ê¹í¬ ê°ë°ê³(WildFly): JNDI íê²½ ì°¨ì´ê°ë§ (log/show-sql ë±)
application-prod.yml        # ê¹í¬ ì´ìê³(WildFly): JNDI íê²½ ì°¨ì´ê°ë§
```

> **ë§ì´ê·¸ë ì´ì ì£¼ì(ê°ëª ì¶©ë)**:
> - íí `application-mssql.yml`(í¬í­ ì§ê²°) â **`application-local-ph.yml`** ë¡ ì´ê´ í `mssql` íë¡íì¼ íê¸°.
> - íí `application-dev.yml`(ê¹í¬ ì§ê²°) â **`application-local-kp.yml`** ë¡ ì´ê´. ê·¸ë¦¬ê³  **`application-dev.yml` íì¼ëªì ì¬ì¬ì©ëì´ JNDI ê°ë°ê³ ì°¨ì´ê° íì¼ë¡ ìë¯¸ê° ë°ëë¤.** (ì§ê²° â JNDI ë¡ ì­í  ì í)
> - ì¤ê³ ìë: JNDI ë¼ë¦¬ëªì´ dev/prod ëì¼íë¯ë¡ **`application-wildfly.yml` í ê³³**ì datasourceë¥¼ ì ìíê³ , dev/prod ë datasourceë¥¼ ì ì¸í **ì§ì§ ì°¨ì´ê°(ë¡ê·¸ë ë²¨/show-sql/ì¸ë¶ ìëí¬ì¸í¸/feature)** ë§ ê°ì§ë¤. â DRY + ë¨ì¼ ì§ì¤ì.

### 4-2. application.yml (base) â íë¡íì¼ ê·¸ë£¹ì¼ë¡ wildfly ì°ê²°
```yaml
spring:
  application:
    name: mcm
  profiles:
    group:
      dev:  [wildfly]   # í¬í­Â·ê¹í¬ ê°ë°ê³: dev íì± ì wildfly(JNDI ë¸ë¡)ë í¨ê» íì±
      prod: [wildfly]   # ê¹í¬ ì´ìê³
    # default active ë ê¸°ë ì -Dspring.profiles.active ë¡ ì§ì  (ìë Â§6)
    # â» local / local-ph / local-kp ë ê·¸ë£¹ì ìì â JNDI ë¸ë¡ ë¯¸ë¡ë© â Hikari ì§ê²°

cactus:
  datasource:
    primary-alias: biz
  jpa:
    extras:
      cmn:     { packages-to-scan: [], persistence-unit-name: cactus-cmn }   # íì¤ 3ì¢ â MCM íì¬ ë§¤í ìí°í° ìì
      if:      { packages-to-scan: [], persistence-unit-name: cactus-if }
      caravan:
        packages-to-scan: [com.dongkuk.dmes.kmc.host, com.dongkuk.dmes.kmc.seraiconfig, com.dongkuk.dmes.kmc.topic]
        persistence-unit-name: cactus-caravan
  tx:
    managers:
      txBiz:     { data-source: biz }
      txCmn:     { data-source: cmn }   # íµì¼(2026-07-02) â ê¸°ì¡´ biz alias â ëë¦½ cmn DS ë¡ ì¬ë°°ì 
      txIF:      { data-source: if }
      txCaravan: { data-source: caravan }
    default-manager: txBiz
```
> `txCmn` ì cmn DS ë¡ ì¬ë°°ì íë¤(ê¸°ì¡´ì biz alias). MCM ìì cmn ì ë¬¼ë¦¬ì ì¼ë¡ biz ì ëì¼ ê³ì (MCMAPUSER)Â·ëì¼ DB ë¥¼ ê°ë¦¬í¤ì§ë§, ë¼ë¦¬ DS/JNDI ì´ë¦ì íì¤ ê·ì½(`dsCmn`/`JNDI_DS_CMN`)ì ë°ë¥¸ë¤.
> â ï¸ **íí `active: local,mssql` ì¡°í© ì ê±°.** ì  ì¤ê³ìì local ê³ì´(ì§ê²°)ê³¼ dev/prod(JNDI)ë ìí¸ë°°íë¤. ë¡ì»¬ì `local | local-ph | local-kp` ì¤ íëë§, WildFly íê²½ì `dev | prod` ì¤ íëë§ íì±íë¤.
> â ï¸ **ê¸°ë³¸ íë¡íì¼ ê³µë°± ì£¼ì(â ìí¥ë ë¶ì ë°ì)**: `active:` ë¥¼ ì ê±°íë©´ íë¡íì¼ ìë bootRun/IDE ê¸°ëì datasource url ë¯¸ì¤ì ì¼ë¡ **ë¶í ì¤í¨**íë¤(íí `bootRun` íì¤í¬ë íë¡íì¼ì ì§ì íì§ ìì â `mcm/api/build.gradle` ì workingDir ë§ ì¤ì ). ëì ì¤ í1:
> **ì±í(2026-07-07 êµ¬í)**: `McmApplication.main()` ìì `setDefaultProperties(spring.profiles.default=local)`.
> base yml ì ì¸ë³´ë¤ ìì  â main() ê²½ë¡(bootRun/IDE)ìë§ ì ì©ëê³  WAR(ServletInitializer) ê²½ë¡ìë ë¯¸ì ì©ì´ë¼,
> WildFly ìì `-Dspring.profiles.active` ëë½ ì ì¡°ì©í SQLite ë¡ ë¨ì§ ìê³  fail-fast íë¤.

### 4-3. application-wildfly.yml â JNDI datasource (dev/prod ê³µíµ)
```yaml
spring:
  datasource:
    jndi-name: ${JNDI_DS_BIZ:java:/jdbc/mssql/mcm/dsBiz}      # biz (MCMAPUSER)
  jpa:
    database-platform: org.hibernate.dialect.SQLServerDialect
    hibernate:
      ddl-auto: none                                         # ì´ì/ê°ë°ê³ ëª¨ë ì¤í¤ë§ ê´ë¦¬ â none

cactus:
  datasource:
    extras:
      cmn:     { jndi-name: "${JNDI_DS_CMN:java:/jdbc/mssql/mcm/dsCmn}" }          # MCMAPUSER (íì¤ 3ì¢)
      if:      { jndi-name: "${JNDI_DS_IF:java:/jdbc/mssql/mcm/dsIF}" }            # EAIUSER
      caravan: { jndi-name: "${JNDI_DS_CARAVAN:java:/jdbc/mssql/mcm/dsCaravan}" }  # CARAVANUSER
  jpa:
    extras:
      cmn:     { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
      if:      { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
      caravan: { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
```
> url/username/password/driver-class-name **ì ë¶ ìì** â ë¬¼ë¦¬ ì ìì WildFly ìì .
> JNDI ì´ë¦ì `${PROP:ê¸°ë³¸ê°}` íí(Â§2-1). ê¸°ë³¸ê°ë§ì¼ë¡ ëìíë©°, í¹ì  WildFlyê° ë¤ë¥¸ ì´ë¦ì ì¸ ëë§ `JNDI_DS_BIZ`/`JNDI_DS_CMN`/`JNDI_DS_IF`/`JNDI_DS_CARAVAN` ë¥¼ `-D` ëë íê²½ë³ìë¡ override. **ì½ë ë³ê²½ ë¶íì**(Spring ì´ íë ì´ì¤íë ìë í´ì).

### 4-4. application-dev.yml (í¬í­Â·ê¹í¬ ê°ë°ê³, WildFly) â JNDI ì°¨ì´ê°ë§
```yaml
spring:
  jpa:
    show-sql: true                 # ê°ë°ê³: SQL ë¡ê¹ ON
logging:
  level:
    com.dongkuk.dmes.mcm: DEBUG
    org.hibernate.SQL: DEBUG
# ââ DataInitializer ê²ì´í¸ â WildFly ê³ì´ì ëªìì ì¼ë¡ ë (â ìí¥ë ë¶ì ë°ì) ââ
# DataInitializer ë biz DS ë¡ DDL/ALTER/ìëë¥¼ ìííë¤(ê¸°ë³¸ê° true).
# ë¯¸ëªì ì ê¸°ë³¸ true ë¡ WildFly JNDI ê³ì ì ì¤í¤ë§ ë³ê²½ì´ ì¤íëë ì¬ê³  ìí â dev/prod ëª¨ë ëªì íì.
dmes:
  init:
    enabled: false
```
> í¬í­Â·ê¹í¬ ê°ë°ê³ë íëì `dev` íë¡íì¼ì ê³µì íë¤. ìë²ë³ ë¬¼ë¦¬ DB ì°¨ì´ë ê° WildFly ì JNDI ë§¤í(Â§5-3)ì´ ë´ë¹íë¯ë¡ ì± yml ì ëì¼í´ë ëë¤.
> ê°ë°ê³ìì ìë/ì¤í¤ë§ ì ì¬ê° íìí ìì ìë§ `enabled: true` ë¡ ì¼ì ì í(ëë `-Ddmes.init.enabled=true`) í ìë³µíë¤.

### 4-5. application-prod.yml (ê¹í¬ ì´ìê³, WildFly) â JNDI ì°¨ì´ê°ë§
```yaml
spring:
  jpa:
    show-sql: false                # ì´ì: SQL ë¡ê¹ OFF
logging:
  level:
    root: WARN
    com.dongkuk.dmes.cactus: INFO
    com.dongkuk.dmes.mcm: INFO
    org.hibernate.SQL: WARN
# ââ DataInitializer â ì´ìì í­ì ë (â ìí¥ë ë¶ì ë°ì) ââ
dmes:
  init:
    enabled: false
# (ì´ì ì ì© ì¸ë¶ ìëí¬ì¸í¸ ë±)
```

### 4-6. application-local-ph.yml (í¬í­ ê°ë° DB ì§ê²°, Hikari) â íí mssql ì´ê´
```yaml
spring:
  datasource:                      # biz â MCMAPUSER
    url: jdbc:sqlserver://10.10.80.241:1433;databaseName=ksm_dmes;encrypt=false;trustServerCertificate=true
    driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
    username: MCMAPUSER
    password: MCMAPUSER_DEV
  jpa:
    database-platform: org.hibernate.dialect.SQLServerDialect
    hibernate: { ddl-auto: none }
    show-sql: true
cactus:
  datasource:
    extras:
      cmn:     { url: jdbc:sqlserver://10.10.80.241:1433;databaseName=ksm_dmes;encrypt=false;trustServerCertificate=true, username: MCMAPUSER, password: MCMAPUSER_DEV, driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver, maximum-pool-size: 5 }
      if:      { url: jdbc:sqlserver://10.10.80.241:1433;databaseName=ksm_dmes;encrypt=false;trustServerCertificate=true, username: EAIUSER,    password: EAIUSER_DEV,    driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver, maximum-pool-size: 5 }
      caravan: { url: jdbc:sqlserver://10.10.80.241:1433;databaseName=ksm_dmes;encrypt=false;trustServerCertificate=true, username: CARAVANUSER, password: CARAVANUSER_DEV, driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver, maximum-pool-size: 5 }
  jpa:
    extras:
      cmn:     { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
      if:      { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
      caravan: { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
dmes:
  init:
    enabled: false                 # ì½ê¸° ì ì© ê¸°ë
```
> `jndi-name` ì´ ìì¼ë¯ë¡ ì½ë ë¶ê¸°(Â§3)ê° ìëì¼ë¡ Hikari ì§ê²° ê²½ë¡ë¥¼ ì í.

### 4-7. application-local-kp.yml (ê¹í¬ ê°ë° DB ì§ê²°, Hikari) â íí dev ì´ê´
```yaml
spring:
  datasource:                      # biz â MCMAPUSER (env override ê°ë¥)
    url: jdbc:sqlserver://${DB_HOST:172.16.2.154}:${DB_PORT:5010};databaseName=${DB_NAME:ksm_dmes};encrypt=false;trustServerCertificate=true
    driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
    username: ${DB_USERNAME:MCMAPUSER}
    password: ${DB_PASSWORD:MCMAPUSER_DEV}
  jpa:
    database-platform: org.hibernate.dialect.SQLServerDialect
    hibernate: { ddl-auto: update }   # ê¹í¬ ê°ë°ê³: ìí°í° ë³ê²½ ìë ë°ì(íí ì ì§)
    show-sql: true
cactus:
  datasource:
    extras:
      cmn:     { url: "${DB_URL:jdbc:sqlserver://${DB_HOST:172.16.2.154}:${DB_PORT:5010};databaseName=${DB_NAME:ksm_dmes};encrypt=false;trustServerCertificate=true}", username: "${DB_USERNAME:MCMAPUSER}", password: "${DB_PASSWORD:MCMAPUSER_DEV}", driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver, maximum-pool-size: 5 }
      if:      { url: "${EAIUSER_DB_URL:jdbc:sqlserver://${DB_HOST:172.16.2.154}:${DB_PORT:5010};databaseName=${DB_NAME:ksm_dmes};encrypt=false;trustServerCertificate=true}", username: "${EAIUSER_DB_USER:EAIUSER}", password: "${EAIUSER_DB_PASSWORD:EAIUSER_DEV}", driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver, maximum-pool-size: 5 }
      caravan: { url: "${CARAVANUSER_DB_URL:jdbc:sqlserver://${DB_HOST:172.16.2.154}:${DB_PORT:5010};databaseName=${DB_NAME:ksm_dmes};encrypt=false;trustServerCertificate=true}", username: "${CARAVANUSER_DB_USER:CARAVANUSER}", password: "${CARAVANUSER_DB_PASSWORD:CARAVANUSER_DEV}", driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver, maximum-pool-size: 5 }
  jpa:
    extras:
      cmn:     { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
      if:      { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
      caravan: { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
dmes:
  init:
    enabled: true                  # ê¹í¬ ê°ë°ê³: ì´ê¸° ìë/ì¤í¤ë§ ì ì¬(íí ì ì§)
```

### 4-8. application-local.yml (SQLite) â íí ì ì§, ë¬´ìì 
```yaml
spring:
  datasource:
    url: jdbc:sqlite:../data/mcm.db
    driver-class-name: org.sqlite.JDBC
  jpa:
    database-platform: org.hibernate.community.dialect.SQLiteDialect
    hibernate: { ddl-auto: update }
cactus:
  datasource:
    extras:
      cmn:     { url: jdbc:sqlite:../data/mcm.db, driver-class-name: org.sqlite.JDBC }        # biz ì ëì¼ DB(ê³µíµ ì¤í¤ë§)
      if:      { url: jdbc:sqlite:../data/serai-if.db, driver-class-name: org.sqlite.JDBC }
      caravan: { url: jdbc:sqlite:../data/serai-caravan.db, driver-class-name: org.sqlite.JDBC }
  jpa:
    extras:
      cmn:     { hibernate: { dialect: com.dongkuk.dmes.mcm.config.CactusSqliteIfNotExistsDialect, ddl-auto: update } }
      if:      { hibernate: { dialect: com.dongkuk.dmes.mcm.config.CactusSqliteIfNotExistsDialect, ddl-auto: update } }
      caravan: { hibernate: { dialect: com.dongkuk.dmes.mcm.config.CactusSqliteIfNotExistsDialect, ddl-auto: update } }
```
> `jndi-name` ì´ ìì¼ë¯ë¡ ì½ë ë¶ê¸°(Â§3)ê° ìëì¼ë¡ Hikari/SQLite ê²½ë¡ ì í.
> â ï¸ local(SQLite): cmn ì biz ì ëì¼ `mcm.db` ë¥¼ ê°ë¦¬ì¼ **ë íì´ ê°ì íì¼ì ì ê·¼**íë¤. MCM ì cmn ë§¤í ìí°í°ê° ìì´(`packages-to-scan: []`) ì¤ì¬ì© ì ê¸ ìíì ë®ì§ë§, ì ê¸ì´ ê´ì¸¡ëë©´ cmn ì ë³ë íì¼(`mcm-cmn.db`)ë¡ ë¶ë¦¬íë¤(if/caravan íì¼ ë¶ë¦¬ì ëì¼ ì·¨ì§).

> **íë¡íì¼ ê·¸ë£¹ ì°ì ìì ì£¼ì**: `application-wildfly.yml`(ê³µíµ)ê³¼ `application-{dev,prod}.yml`(ì°¨ì´ê°)ì **í¤ê° ê²¹ì¹ì§ ìê²** ì ì§(ì ì=datasource/dialect/ddl-auto, íì=log/show-sql/endpoint). ê²¹ì¹ì§ ìì¼ë©´ ê·¸ë£¹ íì± ììë¡ ì¸í override í¼ëì´ ìë¤.

---

## 5. WildFly íê²½ë³ ì¤ì  (í¬í­ ê°ë° / ê¹í¬ ê°ë° / ê¹í¬ ì´ì)

WildFly ìë²ë ë¬¼ë¦¬ì ì¼ë¡ **3ë**(í¬í­ ê°ë°, ê¹í¬ ê°ë°, ê¹í¬ ì´ì)ë¤. ì´ ì¤ í¬í­Â·ê¹í¬ ê°ë° 2ëë ëì¼ `dev` íë¡íì¼ WAR ë¥¼ ë°°í¬ë°ê³ , ê¹í¬ ì´ì 1ëë§ `prod` ë¥¼ ë°ëë¤. **ê° WildFly ë ëì¼ JNDI ë¼ë¦¬ëªì ìê¸° ìë²ì ë¬¼ë¦¬ DBë¥¼ ë§¤í**íë¤.

### 5-1. MSSQL ëë¼ì´ë² ëª¨ë (3ê° WildFly ëì¼)
```
$WILDFLY/modules/com/microsoft/sqlserver/main/
  ââ mssql-jdbc-12.8.1.jre11.jar
  ââ module.xml
```
```xml
<module xmlns="urn:jboss:module:1.9" name="com.microsoft.sqlserver">
  <resources><resource-root path="mssql-jdbc-12.8.1.jre11.jar"/></resources>
  <dependencies><module name="java.sql"/></dependencies>
</module>
```
```xml
<!-- standalone.xml > datasources > drivers -->
<driver name="sqlserver" module="com.microsoft.sqlserver">
  <driver-class>com.microsoft.sqlserver.jdbc.SQLServerDriver</driver-class>
</driver>
```

### 5-2. DataSource ì ì â ê° WildFlyì standalone.xml
4ê° DataSource(Biz/Cmn/If/Caravan)ë¥¼ ìë²ë§ë¤ **ëì¼ jndi-name**, **ë¤ë¥¸ ë¬¼ë¦¬ ì ì**ì¼ë¡ ì ì. (BizÂ·Cmn ì MCM ìì  ëì¼ MCMAPUSER ê³ì ì ê°ë¦¬í´)

**ìì: í¬í­ ê°ë°ê³(dsBiz)** â 10.10.80.241 / ksm_dmes:
```xml
<datasource jndi-name="java:/jdbc/mssql/mcm/dsBiz" pool-name="dsBiz"
            enabled="true" jta="false" use-ccm="false">
  <connection-url>jdbc:sqlserver://10.10.80.241:1433;databaseName=ksm_dmes;encrypt=false;trustServerCertificate=true</connection-url>
  <driver>sqlserver</driver>
  <pool><min-pool-size>5</min-pool-size><max-pool-size>20</max-pool-size></pool>
  <security>
    <user-name>MCMAPUSER</user-name>
    <password>MCMAPUSER_DEV</password>   <!-- ì´ìì credential-store ê¶ì¥(Â§5-4) -->
  </security>
  <validation>
    <valid-connection-checker class-name="org.jboss.jca.adapters.jdbc.extensions.mssql.MSSQLValidConnectionChecker"/>
    <background-validation>true</background-validation>
    <background-validation-millis>30000</background-validation-millis>
  </validation>
</datasource>
<!-- dsCmn(java:/jdbc/mssql/mcm/dsCmn, MCMAPUSER â MCM ì dsBiz ì ëì¼ ê³ì ), dsIF(dsIF, EAIUSER), dsCaravan(dsCaravan, CARAVANUSER) ëì¼ í¨í´ -->
<!-- jndi-name ì ì± yml ê¸°ë³¸ê°ê³¼ ì¼ì¹. ìë²ê° ë¤ë¥¸ ì´ë¦ì ì°ë©´ ì±ì JNDI_DS_* override íì -->
```

### 5-3. íê²½ë³ ë¬¼ë¦¬ ë§¤í í (â íµì¬ ì°ì¶ë¬¼)

| JNDI ë¼ë¦¬ëª(ê¸°ë³¸ê°) | ê³ì  | í¬í­ ê°ë°ê³(dev) | ê¹í¬ ê°ë°ê³(dev) | ê¹í¬ ì´ìê³(prod) |
|-------------|------|-----------------|-----------------|------------------|
| `java:/jdbc/mssql/mcm/dsBiz` | MCMAPUSER | 10.10.80.241:1433 / ksm_dmes | 172.16.2.154:5010 / ksm_dmes | `<ì´ì ìë²:í¬í¸/DB>` |
| `java:/jdbc/mssql/mcm/dsCmn` | MCMAPUSER | 10.10.80.241:1433 / ksm_dmes | 172.16.2.154:5010 / ksm_dmes | `<ì´ì ìë²:í¬í¸/DB>` |
| `java:/jdbc/mssql/mcm/dsIF` | EAIUSER | 10.10.80.241:1433 / ksm_dmes | 172.16.2.154:5010 / ksm_dmes | `<ì´ì ìë²:í¬í¸/DB>` |
| `java:/jdbc/mssql/mcm/dsCaravan` | CARAVANUSER | 10.10.80.241:1433 / ksm_dmes | 172.16.2.154:5010 / ksm_dmes | `<ì´ì ìë²:í¬í¸/DB>` |

> í¬í­Â·ê¹í¬ ê°ë°ê³ë **ëì¼ `dev` WAR** ë¥¼ ë°ì§ë§, ì íëë¡ ê° WildFly standalone.xml ì ë¬¼ë¦¬ ì ìë§ ë¤ë¥´ë¤. **ì±ì ì´ íë¥¼ ì íìê° ìë¤**(JNDI ë¼ë¦¬ëªë§ ìë¤).
> ì´ì ìë² IPÂ·í¬í¸Â·DBëªÂ·ê³ì  ë¹ë°ë²í¸ë ì¸íë¼ ë´ë¹ íì¸ í ì´ì standalone.xml ì ê¸°ì.
> í í¬ê¸° ê¶ì¥: ê°ë°ê³ max 10~20, **ì´ìê³ max 30~50**(ë¶í ê¸°ì¤ ì¡°ì ).

### 5-4. ë¹ë°ë²í¸ ë³´ì (ì´ìê³ ê¶ì¥)
ì´ìì standalone.xml íë¬¸ ëì  Elytron credential-store ì¬ì© ê¶ì¥:
```xml
<security>
  <user-name>MCMAPUSER</user-name>
  <credential-reference store="dmesCredStore" alias="mcm.biz.password"/>
</security>
```

---

## 6. íê²½ë³ ê¸°ë ë°©ë²

| íê²½ | ê¸°ë | íë¡íì¼ |
|------|------|---------|
| ë¡ì»¬(SQLite) | `./gradlew :mcm:api:bootRun` | `-Dspring.profiles.active=local` |
| ë¡ì»¬âí¬í­ DB | `./gradlew :mcm:api:bootRun` | `-Dspring.profiles.active=local-ph` |
| ë¡ì»¬âê¹í¬ DB | `./gradlew :mcm:api:bootRun` | `-Dspring.profiles.active=local-kp` |
| í¬í­ ê°ë°ê³ | WildFly(í¬í­)ì `mcm.war` ë°°í¬ | `-Dspring.profiles.active=dev` |
| ê¹í¬ ê°ë°ê³ | WildFly(ê¹í¬)ì `mcm.war` ë°°í¬ | `-Dspring.profiles.active=dev` |
| ê¹í¬ ì´ìê³ | WildFly(ì´ì)ì `mcm.war` ë°°í¬ | `-Dspring.profiles.active=prod` |

WildFly íë¡íì¼ ì§ì (standalone.conf ëë JAVA_OPTS):
```
JAVA_OPTS="$JAVA_OPTS -Dspring.profiles.active=dev"     # ê°ë°ê³(í¬í­/ê¹í¬ ê³µíµ)
JAVA_OPTS="$JAVA_OPTS -Dspring.profiles.active=prod"    # ì´ìê³
```
> `dev|prod` íì± ì Â§4-2 ê·¸ë£¹ ê·ì¹ì¼ë¡ `wildfly` íë¡íì¼ì´ ìë ì¶ê°ëì´ JNDI ë¸ë¡ì´ ë¡ë©ë¨. `local|local-ph|local-kp` ë ê·¸ë£¹ì ìì´ Hikari ì§ê²°ë¡ ëì.

---

## 7. ì ì© ìì (MCM First) â ì²´í¬ë¦¬ì¤í¸

**Phase A â cactus-core ê³µíµ ì¸íë¼ (íìí¸í)**
- [ ] `DataSourceProps.jndiName` íë ì¶ê°
- [ ] `CactusMultiDataSourceAutoConfiguration` ì `buildDataSource` ë¶ê¸° ì¶ê° â `registerExtra` ì ì©
- [ ] â jndiName ê²½ë¡ìì ë¹ ì ì ë¶ê¸°: `beanClass=DataSource` + `destroyMethodName` ë¯¸ì¤ì (Â§3-1 ì¶ê°ìì  1 â ì»¨íì´ë í close ë°©ì§)
- [ ] â `CactusMultiMybatisAutoConfiguration` íì± ì¡°ê±´ `url` â `url OR jndi-name` ìí(Â§3-1 ì¶ê°ìì  2 â OASIS SqlRunner ìì¸ ë°©ì§)
- [ ] ê¸°ì¡´ ëª¨ë(mls/mpn ë±) ë¬´ìí¥ íê· íì¸(jndiName ë¯¸ì¤ì  ì ê¸°ì¡´ ëì)

**Phase B â mcm ì± (yml ì¬êµ¬ì± + ì½ë ëë° ìì )**
- [ ] `JpaConfig.dataSource()` jndi-name ë¶ê¸° ì¶ê°
- [ ] â `McmApplication.java:71` íë¡íì¼ ì¡°ê±´ ì¬ìì± â `!contains("mssql")` íê¸°, ì  ì²´ê³ ê¸°ì¤(Â§3-4)
- [ ] â `DataInitializer.java:2579` ìë ê²ì´í¸ ì  íë¡íì¼ëªì¼ë¡ ì¬ìì± + íì© í°ì´ ì¬ê²°ì (Â§3-4)
- [ ] mssql-jdbc ì´ë: `mcm/lib/build.gradle`(êµ¬ core, api ì¤ì½í) ì ê±° â `mcm/api/build.gradle` providedRuntime ì¬ì ì¸(Â§3-3, bootRun í´ëì¤í¨ì¤ ìì¡´ íì¸)
- [ ] `application-mssql.yml` â `application-local-ph.yml` ê°ëª/ì´ê´, `mssql` íë¡íì¼ íê¸°
- [ ] íí `application-dev.yml`(ê¹í¬ ì§ê²°) â `application-local-kp.yml` ë¡ ì´ê´
- [ ] `application-wildfly.yml` ì ì¤(JNDI ë¸ë¡)
- [ ] `application-dev.yml` ì¬ìì±(JNDI ê°ë°ê³ ì°¨ì´ê°), `application-prod.yml` JNDI ì°¨ì´ê°ì¼ë¡ ì¬ìì± â **ë ë¤ `dmes.init.enabled: false` ëªì**(Â§4-4/4-5)
- [ ] `application.yml` íë¡íì¼ ê·¸ë£¹(devâwildfly, prodâwildfly) ì¶ê° / `active: local,mssql` ê¸°ë³¸ ì¡°í© ì ê±°
- [ ] â ê¸°ë³¸ íë¡íì¼ í´ë°± ë§ë ¨: `spring.profiles.default: local`(ê¶ì¥) ëë bootRun systemProperty(Â§4-2 â íë¡íì¼ ê³µë°± ë¶í ì¤í¨ ë°©ì§)
- [ ] cmn íì¤í: cactus `jpa.extras.cmn`(cactus-cmn PU) ì¶ê° + `tx.txCmn` â cmn ì¬ë°°ì  + ê° íë¡íì¼ yml ì cmn DS ì¶ê°(Â§4-3/4-6/4-7/4-8) â ì¬ë°°ì  ìì ì± íì¸ë¨(Â§3-4 ì°¸ê³ : txCmn ì¬ì©ì² 0ê±´)
- [ ] ë¬¸ì ê°±ì : `docs/mcm/design/masterRuleList/masterRuleList_ê°ë°ì²´í¬ë¦¬ì¤í¸.md:96`(`active=mssql` ê¸°ë ìë´), `docs/kafka/SERAI-EAI-Phaseìì¸ì¤ê³-v4.md:1007`(`local,mssql`)

**Phase C â WildFly (íê²½ë³)**
- [ ] ëë¼ì´ë² ëª¨ë ì¤ì¹(3ê° ìë²: í¬í­ ê°ë° / ê¹í¬ ê°ë° / ê¹í¬ ì´ì)
- [ ] dsBiz/dsCmn/dsIF/dsCaravan ì ì(`jta=false`, jndi-name `java:/jdbc/mssql/mcm/ds*`) â í¬í­ ê°ë°ë¶í° (dsBizÂ·dsCmn ì MCM ìì  ëì¼ MCMAPUSER)
- [ ] ê¹í¬ ê°ë°ê³ ëì¼ ì ì(172.16.2.154:5010)
- [ ] ì´ì ì ìì ë³´ íë³´ í ëì¼ ì ì(+ ì´ì credential-store)

**Phase D â ê²ì¦/íì¥**
- [ ] ë¡ì»¬ íê·(local / local-ph / local-kp) ê²ì¦(Â§8)
- [ ] í¬í­Â·ê¹í¬ ê°ë°ê³(dev) ë°°í¬ ê²ì¦
- [ ] â WAR ë°°í¬ ì BFF ì ì  íì¸: WildFly HTTP ë¦¬ì¤ë 8100 + ì»¨íì¤í¸ í¨ì¤ ë£¨í¸(`/`) ì ì§ ì¬ë¶ â ì»¨íì¤í¸ í¨ì¤ê° `/mcm` ë±ì¼ë¡ ë°ëë©´ `src/frontend/m-mcm/.env` ì `BACKEND_API_URL`/`MCM_WAS_URL`/`NEXT_PUBLIC_OASIS_API_URL` ìì  íì
- [ ] ì´ì(prod) ìì°¨ ì ì©
- [ ] ì±ê³µ í mls ë± í ëª¨ë ëì¼ í¨í´ íì°

---

## 8. ê²ì¦ ìëë¦¬ì¤

1. **local íê·**: `bootRun active=local` â SQLite DB ì ì ê¸°ë(biz/cmn ëì¼ mcm.db, if/caravan íì¼ / JNDI ë¯¸ì¬ì© íì¸)
2. **local-ph ì§ê²°**: `bootRun active=local-ph` â í¬í­(10.10.80.241) SQL Server 4ê³ì (biz/cmn=MCMAPUSER, if=EAIUSER, caravan=CARAVANUSER) Hikari ì§ê²° ì ì
3. **local-kp ì§ê²°**: `bootRun active=local-kp` â ê¹í¬(172.16.2.154:5010) SQL Server Hikari ì§ê²° ì ì
4. **ê°ë°ê³ ë°°í¬**: WildFly `active=dev`(í¬í­/ê¹í¬) â ë¶í ë¡ê·¸ì 4ê° JNDI lookup ì±ê³µ(`java:/jdbc/mssql/mcm/dsBiz` / dsCmn / dsIF / dsCaravan). ì± ê¸°ë³¸ê° â standalone.xml jndi-name ì¼ì¹ íì¸(ë¶ì¼ì¹ ì JNDI_DS_* override)
5. **í¸ëì­ì ê²½ê³**: `txBiz`/`txCmn`/`txIF`/`txCaravan` ê°ê° ì»¤ë°Â·ë¡¤ë°± ì ì(ì°ê²° enlist ì¶©ë ìì = `jta=false` ê²ì¦)
6. **MyBatis**: biz/cmn/if SqlSession ì¡°íÂ·ê°±ì  ì ì
7. **OASIS ScriptTask**: ë°ì´í°ìì¤ë³ ë¶ê¸° ì ì
8. **WildFly ì½ì**: 4ê° í(dsBiz/dsCmn/dsIF/dsCaravan) active/idle ì¹´ì´í¸ ë¸ì¶, background validation ëì

---

## 9. ë¡¤ë°± ì ëµ

- ì½ë ë¶ê¸°ê° **ìë°©í¥(Hikari/JNDI) ëª¨ë ìì¡´**íë¯ë¡, ymlìì `jndi-name` ì ê±° + `url/username/password` ë³µìë§ì¼ë¡ **ì¦ì Hikari ì§ê²°ë¡ ë³µê·**(ì¬ë°°í¬ë§ íì, ì½ë ë¡¤ë°± ë¶íì).
- local-ph/local-kp ë ì§ê²° íë¡íì¼ì´ë¯ë¡ WildFly ì íê³¼ ë¬´ê´íê² í­ì ì¬ì© ê°ë¥(ê°ë°ì ìì ì¬ì©).
- WildFly DataSourceë ë¹íì±í(`enabled=false`)ë¡ ê²©ë¦¬ ê°ë¥.

---

## 10. ë¦¬ì¤í¬ / ì£¼ìì¬í­

| ë¦¬ì¤í¬ | ìí¥ | ëì |
|--------|------|------|
| `jta=true` ë¡ ì ì | resource-local í¸ëì­ì ì¶©ëÂ·ì´ìëì | **ë°ëì `jta=false`** (Â§1 ìì¹4) |
| â extras ë¹ `destroyMethod="close"` ìì¡´ | ì§ë¤ì´ ì WildFly ì»¨íì´ë í close ìë | jndiName ê²½ë¡ìì destroyMethod ë¯¸ì¤ì (Â§3-1 ì¶ê°ìì  1) |
| â MyBatis `url` ì¡°ê±´ ê²ì´í¸ | jndi-only extras ì SqlSessionTemplate ë¯¸ìì± â OASIS SqlRunner ë°íì ìì¸ | ì¡°ê±´ì url OR jndi-name ì¼ë¡ ìí(Â§3-1 ì¶ê°ìì  2) |
| â íë¡íì¼ ë¦¬í°ë´ ì½ë 2ê³³ ë¯¸ìì  | SQLite override ì¤ë°ë / ìë ì¤ë¨Â·ì¤ë°ë | `McmApplication.java:71`Â·`DataInitializer.java:2579` ëì ìì (Â§3-4) |
| â ê¸°ë³¸ active ì ê±° í íë¡íì¼ ê³µë°± | íë¡íì¼ ìë bootRun/IDE ë¶í ì¤í¨ | `spring.profiles.default: local` í´ë°±(Â§4-2) |
| â dev/prod ì `dmes.init.enabled` ë¯¸ëªì | ê¸°ë³¸ true â WildFly ê³ì ì¼ë¡ DDL/ALTER/ìë ì¤í | dev/prod yml ì `false` ëªì(Â§4-4/4-5) |
| â WAR ì»¨íì¤í¸ í¨ì¤ ë³ê²½ | BFF(m-mcm/.env) 8100 ë£¨í¸ ê°ì  ë¶ê´´ | ë£¨í¸ ë°°í¬ ì ì§ ëë .env 3ê° URL ìì (Â§7 Phase D) |
| mssql-jdbc ê° WAR+ëª¨ë ì¤ë³µ | í´ëì¤ë¡ë ì¶©ë | coreâapi ì´ë + providedRuntimeë¡ WAR ì ì¸(Â§3-3) |
| providedRuntime í bootRun ëë¼ì´ë² ëë½ ì°ë ¤ | local-ph/local-kp ê¸°ë ì¤í¨ | providedRuntime ë runtimeClasspath ìì¡´ â bootRun ì ì(Â§3-3) |
| `local,mssql` ì¡°í© ìì¡´ | ì§ê²°+JNDI í¼ì  | ê¸°ë³¸ activeë¥¼ ë¨ì¼ íê²½ì¼ë¡, `mssql` íë¡íì¼ íê¸°(Â§4-2) |
| íì¼ ê°ëª ì¶©ë(dev ì¬ì¬ì©) | ê¹í¬ ì§ê²°/JNDI í¼ë | íí devâlocal-kp ì´ê´ í dev ë¥¼ JNDI ë¡ ì¬ìì±(Â§4-1 ë§ì´ê·¸ë ì´ì ì£¼ì) |
| local-ph/local-kp yml íë¬¸ ê³ì  | ìê²©ì¦ëª ë¸ì¶ | Git ì ì¸/íê²½ë³ì ì¹í ê¶ì¥(Â§1 ìì¹2 ê°ì£¼) |
| JNDI lookup ìì  ë¯¸ì¡´ì¬ | ë¶í ì¤í¨ | WildFly DSë¥¼ ë°°í¬ ì  ì ë±ë¡, ì´ë¦ ì¤í ì ê² |
| jndi-name ì ëì´ ëë½(`java:/` ìì) | WildFly ë¶í ê±°ë¶(WFLYJCA0117) | ê¸°ë³¸ê°ì `java:/` ì ëì´ íì(Â§2-1) |
| ì± ê¸°ë³¸ê° â standalone.xml ì´ë¦ ë¶ì¼ì¹ | JNDI lookup ì¤í¨ | ëì¼ ê·ì½ ì ì§, ë¤ë¥´ë©´ ì±ì JNDI_DS_* override(Â§4-3) |
| ìì íë¡í¼í°(ê¸°ë³¸ê° ìì) ì¬ì© | ë¯¸ì£¼ì ì ë¶í ì¤í¨ | ë°ëì `${PROP:ê¸°ë³¸ê°}` íí ì ì§(Â§2-1) |
| cmn=biz ëì¼ ê³ì ì 2ê° í | ì»¤ë¥ì ìí­ ì¦ê°(ê²½ë¯¸) | MCM ì cmn ìí°í° ìì â ìí¥ ë¯¸ë¯¸. cmn ì´ ë³ë ê³ì /DB íì ì Â§2Â·Â§4Â·Â§5 ì¡°ì  |
| local(SQLite) cmnÂ·biz ëì¼ íì¼ | ì ê¸(database is locked) ê°ë¥ | cmn ìí°í° ìì´ ìí ë®ì, ê´ì¸¡ ì `mcm-cmn.db` ë¶ë¦¬(Â§4-8) |
| ì´ì ì ìì ë³´ ë¯¸íì  | ì ì© ì§ì° | ì¸íë¼ ë´ë¹ ì¬ì  íë³´(Â§5-3 í) |
| íë¡íì¼ ê·¸ë£¹ override í¼ë | ì¤ì  ì¶©ë | wildfly.ymlê³¼ dev/prod.yml í¤ ë¹ì¤ì²© ì ì§(Â§4-8) |

---

## ë¶ë¡ A â "ë¬´ìì´ ì´ëì ì¬ëê°" ìì½

| ì ë³´ | ìì¹ | íê²½ë³ ë¤ë¦? |
|------|------|------------|
| JNDI ë¼ë¦¬ëª(ê¸°ë³¸ê° `java:/jdbc/mssql/mcm/ds*`) | ì± yml(wildfly.yml), `JNDI_DS_*` ë¡ override ê°ë¥ | â dev/prod ëì¼ |
| WildFly ìë² IP/í¬í¸/DB/ê³ì /ë¹ë°ë²í¸ | **WildFly standalone.xml** | â ìë²ë³ ë¤ë¦ |
| ì»¤ë¥ì í í¬ê¸°/ê²ì¦ | WildFly standalone.xml | â (ì´ì ë í¼) |
| dialect / ddl-auto | ì± yml(wildfly.yml) | â SQL Server ê³µíµ |
| show-sql / ë¡ê·¸ë ë²¨ / ì¸ë¶ ìëí¬ì¸í¸ | ì± yml(dev/prod.yml) | â íê²½ë³ |
| local-ph/local-kp ì§ê²° ì ì(í¬í­/ê¹í¬ DB) | ì± yml(local-ph/local-kp.yml) | ë¡ì»¬ ê°ë° ì ì© |
| SQLite ì ì | ì± yml(local.yml) | local ì ì© |

## ë¶ë¡ B â íë¡íì¼ ìì½ (íëì)

| profile | ì ì ëì | ë°©ì | wildfly ê·¸ë£¹ | ì¤í |
|---------|----------|------|-------------|------|
| `local` | SQLite íì¼ | Hikari ì§ê²° | â | bootRun |
| `local-ph` | í¬í­ ê°ë° DB(10.10.80.241:1433) | Hikari ì§ê²° | â | bootRun |
| `local-kp` | ê¹í¬ ê°ë° DB(172.16.2.154:5010) | Hikari ì§ê²° | â | bootRun |
| `dev` | ê° WildFly ë¡ì»¬ DB(í¬í­/ê¹í¬) | JNDI | â | WildFly WAR |
| `prod` | ê¹í¬ ì´ì DB | JNDI | â | WildFly WAR |


---

## 11. íì° 1í¸ â caravan-hub ì ì© (2026-07-09 êµ¬í ìë£)

mcm í¨í´ì caravan-hub(ë¹-cactus, ëì¼ Hikari ì§ê²° êµ¬ì¡°)ì íì°. ì¬ì©ì íì (2026-07-09):
**mcm ë¼ë¦¬ DS ì¬ì¬ì© / Kafka ë JVM íë¡í¼í° / ì»¨íì¤í¸ ë£¨í¸ `/` / init ê²ì´í¸ ì ì¤**.

### 11-1. DataSource ë§¤í (mcm ë¼ë¦¬ DS ì¬ì¬ì©)

| alias | ê³ì  | JNDI (ê¸°ë³¸ê°) | override |
|-------|------|---------------|----------|
| **mst** (@Primary) | CARAVANUSER | `java:/jdbc/mssql/mcm/dsCaravan` | `JNDI_DS_MST` |
| **if** | EAIUSER | `java:/jdbc/mssql/mcm/dsIF` | `JNDI_DS_IF` |

- caravan-hub ì ì© DS ë¥¼ ë§ë¤ì§ ìê³  **mcm ì´ ë±ë¡í dsCaravan/dsIF ë¥¼ ê·¸ëë¡ lookup** (ê³ì  ì¼ì¹ íì¸ë¨).
- caravan-hub ìë²ê·¸ë£¹ì´ mcm ê³¼ **ê°ì domain.xml íë¡íì¼**ì ì°ë©´ ì¶ê° ë±ë¡ ë¶íì, ë¤ë¥¸ íë¡íì¼ì´ë©´ ëì¼ ì ì ë³µì .
- ì»¨íì´ë(ìë²)ê° ë¶ë¦¬ë¼ ìì´ JVM ìì¤í íë¡í¼í° ê³µì  ìì â override ì´ë¦ë ê³µì© ê·ì½(`JNDI_DS_*`) ì ì§.
- íì ìë²(JVM)ë³ ê°ë³ ìì± â mcm ê³¼ ì»¤ë¥ì ê²½í© ìë.

### 11-2. Kafka ë¸ë¡ì»¤ â JVM íë¡í¼í° ìì  (JNDI ë¹ëì ì ì¼ í­ëª©)

DB ì ë¬ë¦¬ Kafka ì£¼ìë JNDI ë¡ í¡ì ë¶ê° â **íê²½ ì°¨ì´ê° íì¼(dev/prod.yml) ìì ** (wildfly.yml ì JNDI ì ì© ì ì§):

```yaml
# application-dev.yml  â ê¸°ë³¸ê° = í¬í­ ê°ë° ë¸ë¡ì»¤. ê¹í¬ WildFly ë§ -D ë¡ override
caravan.kafka.bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:10.10.80.241:9092}
# application-prod.yml â ê¸°ë³¸ê° ìì(íì). ë¯¸ì£¼ì ì ë¶í ì¤í¨ = ê°ë° ë¸ë¡ì»¤ ì¤ì ì ì¬ê³  ë°©ì§
caravan.kafka.bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS}
```

### 11-3. ë³ê²½ ë´ì­ (êµ¬í ìë£)

| êµ¬ë¶ | ë´ì© |
|------|------|
| `DataSourceConfig.java` | mst/if ë¹ì `spring.datasource.{mst,if}.jndi-name` ì ë¬´ ë¶ê¸° (JndiDataSourceLookup â ê¸°ì¡´ DataSourceBuilder) |
| `DataInitializer.java` | **`caravan-hub.init.enabled` ê²ì´í¸ ì ì¤** (ê¸°ë³¸ true=íí, dev/prod yml ì false ëªì â DDL skip) |
| `CaravanHubApplication.java` | main() ì `spring.profiles.default=local` í´ë°± (WAR ê²½ë¡ ë¯¸ì ì© â -D ëë½ ì fail-fast) |
| `build.gradle` | mssql-jdbc `runtimeOnly` â `providedRuntime` (WAR lib-provided ê²©ë¦¬, bootRun ìì¡´) |
| `jboss-web.xml` ì ì¤ | `<context-root>/</context-root>` â mcm(/mcm)ê³¼ ë¬ë¦¬ ë£¨í¸ (ì ì© ì»¨íì´ë, ì¬ì©ì ê²°ì ) â MCM ì `CARAVAN_HUB_BASE_URL` ì ì»¨íì¤í¸ ìì´ `http://<host>:<port>` |
| yml ì¬í¸ | `mssql`â`local-ph`(+í¬í­ Kafka ëªì), êµ¬ `dev`(ì§ê²°)â`local-kp`, `wildfly` ì ì¤(JNDI 2ì¢), `dev`/`prod` JNDI ì°¨ì´ê° ì¬ìì±, base ì group + `active: local,mssql` ì ê±° |

### 11-4. ê¸°ë JVM ìµì (caravan-hub)

| íê²½ | íì | ì í |
|------|------|------|
| dev (í¬í­) | `-Dspring.profiles.active=dev` | (ê¸°ë³¸ê°ì¼ë¡ ëì) |
| dev (ê¹í¬) | `-Dspring.profiles.active=dev -DKAFKA_BOOTSTRAP_SERVERS=<ê¹í¬ ë¸ë¡ì»¤>` | |
| prod | `-Dspring.profiles.active=prod -DKAFKA_BOOTSTRAP_SERVERS=<ì´ì ë¸ë¡ì»¤>` âë ë¤ íì | |
| ê³µíµ ì í | | `-DINTEGRATION_DB_ENABLED=false`(DB ì¸ë°ì´ë í´ë§ off), `-Dcaravan-hub.init.enabled=true`(ì¤í¤ë§ ì ì¬ ì¼ì), `-DJNDI_DS_MST`/`-DJNDI_DS_IF`(ì´ë¦ ë¶ì¼ì¹ ì) |

> íê¸°ë env: `CARAVAN_HUB_MST_DB_URL/USERNAME/PASSWORD`, `CARAVAN_HUB_IF_DB_*` (êµ¬ prod ì§ê²° ë°©ì â JNDI ë¡ ëì²´).

### 11-5. ê²ì¦ ìí

- [x] bootWar BUILD SUCCESSFUL / WAR ì mssql-jdbc ë¯¸í¬í¨(lib-provided)Â·jboss-web.xml(`/`) í¬í¨ íì¸
- [ ] WildFly(dev) ë°°í¬ ê²ì¦ â mcm ê³¼ ëì¼ íë¡íì¼ì´ë©´ dsCaravan/dsIF lookup ì¦ì ì±ê³µ ìì
- [ ] ì´ì ë¸ë¡ì»¤ ì£¼ì íì  í prod ì ì©


---

## 12. íì° 2í¸ â mqcÂ·mppÂ·mpnÂ·mls ì¼ê´ ì ì© (2026-07-13 êµ¬í ìë£)

4ê° ëª¨ëì mcm í¨í´ íì° + **mqc/mpp ë ë©í°DS íì¤(biz/cmn/if) ëì ëì** (ì¬ì©ì íì  2026-07-13).

### 12-1. ëª¨ëë³ DS ê³ì  ë§¤í¸ë¦­ì¤ (ì¬ì©ì íì )

| ëª¨ë | dsBiz (ì ì© ë±ë¡ íì) | cmn | if | ì»¨íì¤í¸ |
|------|----------------------|-----|-----|---------|
| mqc | `java:/jdbc/mssql/mqc/dsBiz` = MQCAPUSER/MQCAPUSER_DEV | mcm/dsCmn ì¬ì¬ì© | mcm/dsIF ì¬ì¬ì© | /mqc |
| mpp | `java:/jdbc/mssql/mpp/dsBiz` = MPPAPUSER/MPPAPUSER_DEV | ã | ã | /mpp |
| mpn | `java:/jdbc/mssql/mpn/dsBiz` = MPNAPUSER/MPNAPUSER_DEV | ã | ã | /mpn |
| mls | `java:/jdbc/mssql/mls/dsBiz` = MLSAPUSER/MLSAPUSER_DEV | ã (**dmom ê¸°ë¥ íì**) | ã | /mls |

- cmn=MCMAPUSER/MCMAPUSER_DEV, if=EAIUSER/EAIUSER_DEV â 4ê° ëª¨ë ê³µíµ, **mcm ì´ ë±ë¡í ë¼ë¦¬ DS ì¬ì¬ì©**.
- WildFly(domain íë¡íì¼)ìë **ëª¨ëë³ dsBiz 4ì¢ë§ ì¶ê° ë±ë¡** (`jta=false`). cmn/if ë ê¸°ì¡´ ê² ì¬ì©.
- mpn dsBiz í ì¬ì´ì§: ì¥ê¸° íëë í¸ëì­ì ëì min 5 / max 30 ê¶ì¥ (êµ¬ hikari max=30 ì´ê´).

### 12-2. ê³µíµ ì ì© ë´ì­ (4ê° ëª¨ë ëì¼)

- íë¡íì¼ ì¬í¸: local / local-ph(í¬í­ 10.10.80.241 ì§ê²°) / local-kp(ê¹í¬ 172.16.2.154:5010 ì§ê²°) / devÂ·prod(JNDI) + `profiles.group` + êµ¬ `active` ê¸°ë³¸ ì¡°í© íê¸° + `application-mssql.yml` ì­ì .
- main(): `spring.profiles.default=local` í´ë°± + extras SQLite ì ëê²½ë¡ override(acceptsProfiles ê²ì´í¸).
- mssql-jdbc: `lib`(api) â `api`(providedRuntime). â» ì´ë¤ ëª¨ë ìë¸íë¡ì í¸ë core ê° ìëë¼ **lib**.
- `jboss-web.xml` ì ì¤(ëª¨ëë³ /{ëª¨ë} ì»¨íì¤í¸ â mcm ì ë¡, NGINX ë¼ì°í ì í©).
- ìë/ì´ëìë¼ì´ì  `dmes.init.enabled` ê²ì´í¸(ê¸°ë³¸ true=íí, local-ph/dev/prod falseÂ·local-kp true):
  mqc CommCodeSeeder / mpp ì´ëìë¼ì´ì  6ì¢(Jig*Â·CommonCode) / mls MlsLovDataInitializer. (mpn ì ê¸°ì¡´ @Profile("local") ê²ì´í¸ ì ì§)

### 12-3. ëª¨ëë³ í¹ì´ ì ì©

- **mqc/mpp (ë©í°DS ì ê· ëì)**: base ì primary-alias/extras(ë¹ PU)/tx íì¤ 3ì¢/`mybatis.enabled: false` ì¶ê°.
  primary ë JpaConfig ìì´ Boot ìëì¤ì  â `spring.datasource.jndi-name` ë§ì¼ë¡ JNDI ëì(ì½ë ë¶ê¸° ë¶íì).
  mpp ë `mpp.common-code.schema: "MCMAPUSER."` ë¥¼ local-ph/local-kp/wildfly ì ë°ì. êµ¬ dev yml ì
  mcm ë³µë¶ ê¸°ë³¸ê°(databaseName=MCMAPUSER/mcmapuser) íê¸° â ì  ê³ì ì¼ë¡ ì ì .
- **mpn**: `MpnJpaConfig.dataSource()` jndi ë¶ê¸° + `MpnApplication` íë¡íì¼ ë¦¬í°ë´ ì¬ìì±.
  prod ë Flyway(mssql migrations)+MssqlPlaceholderGuard ì ì§ â Flyway ë JNDI primary ë¡ ëì.
  `application-mssql-validate.yml` ì¬ì©ë²ì `local-ph,mssql-validate` ì¡°í©ì¼ë¡ ê°±ì .
- **mls**: `JpaConfig.dataSource()` jndi ë¶ê¸° + `JpaPersistenceProviderEnforcer` ì´ì(mpn ëì¼ â cactus ë³´ì¡° EMF
  ì WildFly NoSuchMethodError ë°©ì§) + `default_schema: MLSAPUSER` ë¥¼ wildfly.yml ì ëªì.
  local-ph ë ì ì¤(êµ¬ mssql yml ì ê¹í¬ íë¬¸ ì¤ë³µì´ë¼ íê¸°) â â ï¸ í¬í­ DB ì MLSAPUSER ê³ì  ì¡´ì¬ ì¬ë¶ ìµì´ ì¬ì© ì  íì¸.
  (ë¶ì ìì ) SERAIâcaravan-hub ê°í¸ ìì¬ë¡ ì»´íì¼ ë¶ê°ìë ìë¹ì¤ 3ì¢
  (SlitInMgmt/SlitStockIssueMgmt/SlitStockMgmt)ì `SeraiIntegrationClient` â `CaravanHubIntegrationClient` ë¦¬ë¤ì.

### 12-4. ê¸°ë JVM ìµì (4ê° ëª¨ë ê³µíµ)

| íê²½ | ìµì |
|------|------|
| dev | `-Dspring.profiles.active=dev` (+ ê°ë° JWT/í´ë¼ì´ì¸í¸í¤ ê¸°ë³¸ê° ì¬ì© ê°ë¥) |
| prod | `-Dspring.profiles.active=prod -DJWT_SECRET=<ì¤í¤> -DBACKEND_CLIENT_KEY=<í¤>` (ì ë¤ íì) |
| ê³µíµ ì í | `-Ddmes.init.enabled=true`(ìë ì¼ì), `-DJNDI_DS_BIZ/CMN/IF`(ì´ë¦ ë¶ì¼ì¹ ì), `-DCARAVAN_HUB_BASE_URL` |

### 12-5. ê²ì¦ ìí

- [x] 4ê° ëª¨ë bootWar BUILD SUCCESSFUL / WAR ì mssql-jdbc lib-provided ê²©ë¦¬Â·jboss-web.xml ì»¨íì¤í¸ íì¸
- [x] ì ê·Â·ìì  yml 30ì¢ YAML íì ê²ì¦ íµê³¼
- [ ] WildFly(dev) ë°°í¬ ê²ì¦ â ëª¨ëë³ dsBiz 4ì¢ ë±ë¡ í (cmn/if ë mcm ê² ê¸°ë±ë¡ ì ì )
- [ ] mls: í¬í­ MLSAPUSER ê³ì  íì¸ / ì´ì ì ìì ë³´ íì 

â ë â
