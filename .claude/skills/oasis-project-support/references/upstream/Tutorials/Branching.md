# Branching

이 튜토리얼은 [스프링부트](https://spring.io/projects/spring-boot)를 이용해서 간단한 웹페이지를 만들어보고 OASIS에서 흐름 제어를 어떻게 하는지 알아봅니다.

# 프로젝트 개요

Work with SpringBoot 에서 만든 서비스를 OASIS 브랜치를 이용해서 어떻게 만들 수 있는지 알아봅니다.

이 튜토리얼을 통해

- 태스크 실행 결과 다루기
- 게이트웨이에서 분기하기
- 태스크에서 분기하기

에 대하여 알 수 있습니다.

### 필요 개발 도구

IntelliJ Community([다운로드](https://www.jetbrains.com/idea/download/))

### 선행 학습

튜토리얼 [Work with SpringBoot](Work%20with%20SpringBoot.md) 를 먼저 수행하는 것을 추천드립니다.

# SpringBoot 프로젝트 만들기

### 프로젝트 다운로드

[스프링 이니셜라이저 페이지](https://start.spring.io)에서 아래처럼 옵션을 선택하고 다운로드 받습니다.

![Untitled](Branching/Untitled.png)

<aside>
💡 Spring Boot 버전은 SNAPSHOT, M2 등 라벨이 안붙은 최신버전을 선택하면 됩니다.

</aside>

### 프로젝트 임포트

다운로드 받은 zip 파일을 압축해제 후 개발도구로 프로젝트를 열어주세요.

![Untitled](Work%20with%20SpringBoot/Untitled%201.png)

### 프로젝트 실행

*TutorialsBranchingApplication.java* 파일을 열고 마우스 오른쪽 클릭하여 프로젝트를 실행시켜 봅니다.

<aside>
💡 Run As → Java Application

</aside>

아래와 같이 로그가 출력되고 멈추면 웹 브라우저를 켜서 [http://localhost:8080](http://localhost:8080) 으로 접속해 봅니다.

```
.   ____          _            __ _ _
 /\\ / ___'_ __ _ _(_)_ __  __ _ \ \ \ \
( ( )\___ | '_ | '_| | '_ \/ _` | \ \ \ \
 \\/  ___)| |_)| | | | | || (_| |  ) ) ) )
  '  |____| .__|_| |_|_| |_\__, | / / / /
 =========|_|==============|___/=/_/_/_/
 :: Spring Boot ::                (v2.5.4)

2021-09-01 10:01:50.337  INFO 1117 --- [           main] o.t.TutorialsBranchingApplication        : Starting TutorialsBranchingApplication using Java 11.0.11 on localhost with PID 1117 (~/IdeaProjects/tutorials-branching/build/classes/java/main started by user in ~/IdeaProjects/tutorials-branching)
2021-09-01 10:01:50.344  INFO 1117 --- [           main] o.t.TutorialsBranchingApplication        : No active profile set, falling back to default profiles: default
2021-09-01 10:01:51.408  INFO 1117 --- [           main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat initialized with port(s): 8080 (http)
2021-09-01 10:01:51.427  INFO 1117 --- [           main] o.apache.catalina.core.StandardService   : Starting service [Tomcat]
2021-09-01 10:01:51.427  INFO 1117 --- [           main] org.apache.catalina.core.StandardEngine  : Starting Servlet engine: [Apache Tomcat/9.0.52]
2021-09-01 10:01:51.507  INFO 1117 --- [           main] o.a.c.c.C.[Tomcat].[localhost].[/]       : Initializing Spring embedded WebApplicationContext
2021-09-01 10:01:51.508  INFO 1117 --- [           main] w.s.c.ServletWebServerApplicationContext : Root WebApplicationContext: initialization completed in 1076 ms
2021-09-01 10:01:51.914  INFO 1117 --- [           main] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat started on port(s): 8080 (http) with context path ''
2021-09-01 10:01:51.925  INFO 1117 --- [           main] o.t.TutorialsBranchingApplication        : Started TutorialsBranchingApplication in 2.314 seconds (JVM running for 2.825)
2021-09-01 10:02:03.893  INFO 1117 --- [nio-8080-exec-1] o.a.c.c.C.[Tomcat].[localhost].[/]       : Initializing Spring DispatcherServlet 'dispatcherServlet'
2021-09-01 10:02:03.893  INFO 1117 --- [nio-8080-exec-1] o.s.web.servlet.DispatcherServlet        : Initializing Servlet 'dispatcherServlet'
2021-09-01 10:02:03.894  INFO 1117 --- [nio-8080-exec-1] o.s.web.servlet.DispatcherServlet        : Completed initialization in 1 ms
```

*Whitelabel Error Page*가 출력되면 정상입니다. 정상 실행이 확인이 되면 *Stop* 버튼을 눌러 서버를 종료합니다.

![Untitled](Work%20with%20SpringBoot/Untitled%203.png)

# 핵심 로직 구현

이 프로젝트의 핵심인 사용자 정보를 이용해서 가입처리를 하는 로직을 구현합니다.

### Member 클래스

기본 패키지 `oasis.tutorials.springboot` 밑에 `domain` 패키지를 추가하고 `domain` 패키지에 맴버를 모델화한 클래스 `Member` 클래스를 만듭니다.

![Untitled](Branching/Untitled%201.png)

```java
package oasis.tutorials.branching.domain;

public class Member {
    private final String id;
    private final String name;

    public Member(String id, String name) {
        this.id = id;
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public String getId() {
        return id;
    }
}
```

### MemberRepository

MemberRepository 인터페이스와 메모리로 동작하는 구현체를 만듭니다.  

```java
package oasis.tutorials.branching.domain;

public interface MemberRepository {
    void save(Member member);
    Member findById(String id);
}
```

```java
package oasis.tutorials.branching.domain;

import java.util.HashMap;
import java.util.Map;

public class MemoryMemberRepository implements MemberRepository {
    private final Map<String, Member> members = new HashMap<>();

    @Override
    public void save(Member member) {
        members.put(member.getId(), member);

    }

    @Override
    public Member findById(String id) {
        return members.get(id);
    }
}
```

### MemberService

Member를 가입하고 찾는 기능을 제공하는 서비스를 만듭니다.

```java
package oasis.tutorials.branching.domain;

public class MemberService {
    private final MemberRepository memberRepository;

    public MemberService(MemberRepository memberRepository) {
        this.memberRepository = memberRepository;
    }

    public void join(String id, String name) {
        memberRepository.save(new Member(id, name));
    }

    public Member findMember(String id) {
        return memberRepository.findById(id);
    }
}
```

# 핵심 로직 테스트

### MemberService 테스트

우리가 만든 서비스가 제대로 동작하는지 단위 테스트를 합니다. *MemberService.java* 파일을 열고 class 이름에 커서를 둔 체 *alt+Enter*를 누르면 컨텍스트 메뉴가 나타나는데 메뉴에서 *Create test*를 선택합니다.

![Untitled](Branching/Untitled%202.png)

![Untitled](Branching/Untitled%203.png)

```java
package oasis.tutorials.branching.domain;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

class MemberServiceTest {
    @Test
    void join() {
        MemberService memberService =
                new MemberService(new MemoryMemberRepository());
        memberService.join("1", "name");

        Member member1 = memberService.findMember("1");
        Assertions.assertThat(member1).isNotNull();

        Member member2 = memberService.findMember("2");
        Assertions.assertThat(member2).isNull();
    }
}
```

새로운 멤버를 가입하고 가입한 ID로 가입한 멤버를 정상적으로 가져오는지, 가입하지 않은 멤버를 가져왔을 때는 `null` 을 반환하는지 테스트합니다.

클래스 이름에 커서를 두고 마우스 오른쪽 버튼을 눌러 컨텍스트 메뉴를 연뒤 *Run 'MemberServiceTest'*를 선택합니다.

![Untitled](Branching/Untitled%204.png)

# OASIS로 서비스 개발

## BPMN 서비스 설계

### 서비스 디렉토리 생성

*resources* 밑에 *services* 디렉토리를 만듭니다.

### 가입 서비스 모델링

1. [Camunda 모델러](../BPMN%E2%84%A2%EF%B8%8F/Camunda%20Modeler.md)를 실행시킵니다.
2. *BPMN diagram (Camunda Platform)* 을 선택하여 새로운 다이어그램을 만듭니다.
3. 태스크를 시작 **이벤트에 연결하여 추가**하고 태스크 타입을 **서비스 태스크로 변경**합니다.
4. 속성 패널의 *General* 탭에 아래와 같이 입력합니다.
    - *Name* : 조회
    - *Details* → *Implementation* : Java Class
    - *Java* *Class* : oasis.tutorials.branching.domain.MemberService
    
    ![Untitled](Branching/Untitled%205.png)
    
5. 속성 패널의 *Extentions* 탭에 아래와 같이 입력합니다.
    - *Properties* → *Add Property*
        
        *name* : method
        
        *value* : findMember
        
    
    ![Untitled](Branching/Untitled%206.png)
    
6. **가입 태스크에 연결하여 새 태스크를 추가**하고 태스크 타입을 **서비스 태스크로 변경**합니다.
7. 속성 패널의 *General* 탭에 아래와 같이 입력합니다.
    - *Name* : 가입
    - *Details → Implementation* : Java Class
    - *Java Class* : oasis.tutorials.branching.domain.MemberService
    
    ![Untitled](Branching/Untitled%207.png)
    

8.속성 패널의 *Extentions* 탭에 아래와 같이 입력합니다.

- *Properties* → *Add Property*
    
    *name* : method
    
    *value* : join
    

![Untitled](Branching/Untitled%208.png)

1. *종료 이벤트*를 추가합니다. 완성된 다아어그램은 아래와 유사할 것입니다.
    
    ![Untitled](Branching/Untitled%209.png)
    
2. *조회* 태스크를 선택하고 *종료 이벤트*를 추가로 연결합니다.
    
    ![Untitled](Branching/Untitled%2010.png)
    
3. 새로 추가한 *종료 이벤트*를 선택해서 *Error End Event* 로 타입을 변경합니다.
    
    ![Untitled](Branching/Untitled%2011.png)
    
    ![Untitled](Branching/Untitled%2012.png)
    
4. 에러 종료 이벤트를 선택해서 에러 메시지와 에러 이름을 입력합니다. 속성 패널의 *General* 탭에서 입력합니다.
    - *Name* : AlreadyJoinedError
    - *Message* : #{id}는 가입되어 있는 ID입니다.
    
    ![Untitled](Branching/Untitled%2013.png)
    
5. 속성 패널의 *Extentions* 탭에 아래와 같이 입력합니다. input 속성은 컨텍스트에 있는 id값을 가져와서 에러 메시지의 바인딩 소스로 사용합니다.
    - *Properties* → *Add Property*
        
        *name* : input
        
        *value* : id
        
    
    ![Untitled](Branching/Untitled%2014.png)
    
6. 조회와 가입 태스크를 연결하는 흐름을 선택해서 분기 조건을 입력합니다. 속성 패널의 *General* 탭에서 입력합니다.
    
    ![Untitled](Branching/Untitled%2015.png)
    
    - *Name* : null
    - *Condition Type* :Expression
    - *Expression* : #root == null
    
    입력 후에는 흐름에 조건 흐름이라는 표식과 이름이 붙어서 보입니다.
    
    ![Untitled](Branching/Untitled%2016.png)
    

## OASIS Service를 실행하는 테스트 만들기

### 프로젝트에 OASIS 의존성 추가

build.gradle 파일에 oasis 배포 서버를 추가합니다.

```groovy
repositories{
	maven{
		url "http://10.110.1.12:8889/nexus/content/groups/public"
	  allowInsecureProtocol true
	}
	mavenCentral()
}
```

oasis 의존성을 추가합니다.

```groovy
dependencies{
	implementation 'oasis:oasis-core:4.0.1'
  implementation 'org.springframework.boot:spring-boot-starter-web'
  testImplementation 'org.springframework.boot:spring-boot-starter-test'
}
```

### OASIS 실행 테스트 작성

`MemberServiceTest` 클래스에 OASIS 서비스를 실행하고 그 결과를 검증하는 테스트 케이스를 추가 작성합니다.

```java
@Test
void runWithOasis() {
    ServiceStarter serviceStater =
            new NonTransactionalServiceStarterFactory().generateServiceStarter();
    MemoryMemberRepository memberRepository = new MemoryMemberRepository();

    Map<String, TypedObject> acc = new HashMap<>();
    acc.put("memberRepository", new TypedObject(memberRepository));

    ApplicationContext applicationContext = new DefaultApplicationContext(acc);

    Map<String, TypedObject> scc = new HashMap<>();
    scc.put("id", new TypedObject("id1"));
    scc.put("name", new TypedObject("newMemberName"));

    ServiceContext sc = new DefaultServiceContext(applicationContext, scc);

    ServiceResult start = serviceStater.start("member", sc);
    Assertions.assertThat(start.serviceResultCode())
            .isEqualTo(ServiceResultCode.SUCCESS);

    Member member = memberRepository.findById("id1");
    Assertions.assertThat(member).isNotNull();
}
```

테스트를 실행시키고 남은 로그를 보면 어떤 태스크를 통과하여 실행했고 수행시간은 얼마나 걸렸는지에 대한 정보를 알 수 있습니다.

```
10:14:08.066 [Test worker] INFO oasis.service.CoreServiceStarter - Service [member] start.
10:14:08.181 [Test worker] DEBUG oasis.unmarshal.camunda.CamundaFlowsStoreBuilder - Check element flows : Activity_1dqqoko
10:14:08.183 [Test worker] DEBUG oasis.unmarshal.camunda.CamundaFlowsStoreBuilder - Check element flows : StartEvent_1
10:14:08.183 [Test worker] DEBUG oasis.unmarshal.camunda.CamundaFlowsStoreBuilder - Check element flows : Activity_0a9mv94
10:14:08.202 [Test worker] INFO oasis.process.CoreProcessStarter - Process [Process_00plawv](Process_00plawv) start.
10:14:08.204 [Test worker] INFO oasis.model.event.DefaultStartEvent - Task [StartEvent_1](StartEvent_1) start.
10:14:08.207 [Test worker] INFO oasis.model.event.DefaultStartEvent - Task [StartEvent_1](StartEvent_1) finish.(2ms)
10:14:08.207 [Test worker] INFO oasis.model.activity.JavaServiceTask - Task [Activity_0a9mv94](조회) start.
10:14:08.219 [Test worker] INFO oasis.executors.PlainJavaServiceTaskExecutable - Invoking class : [oasis.tutorials.branching.domain.MemberService], method : [findMember]
10:14:08.256 [Test worker] DEBUG io.github.thecodinglog.methodinvoker.ParameterNameMethodArgumentBindingStrategy - Parameter name binding of memberRepository
10:14:08.262 [Test worker] DEBUG io.github.thecodinglog.methodinvoker.ParameterNameMethodArgumentBindingStrategy - Parameter name binding of id
10:14:08.263 [Test worker] INFO oasis.model.activity.JavaServiceTask - Task [Activity_0a9mv94](조회) finish.(55ms)
10:14:08.321 [Test worker] DEBUG oasis.model.flow.nodes.SpElConditionalFlowPicker - Condition:[#root == null], Result:[true]
10:14:08.321 [Test worker] INFO oasis.model.activity.JavaServiceTask - Task [Activity_1dqqoko](가입) start.
10:14:08.321 [Test worker] INFO oasis.executors.PlainJavaServiceTaskExecutable - Invoking class : [oasis.tutorials.branching.domain.MemberService], method : [join]
10:14:08.322 [Test worker] DEBUG io.github.thecodinglog.methodinvoker.ParameterNameMethodArgumentBindingStrategy - Parameter name binding of id
10:14:08.322 [Test worker] DEBUG io.github.thecodinglog.methodinvoker.ParameterNameMethodArgumentBindingStrategy - Parameter name binding of name
10:14:08.323 [Test worker] INFO oasis.model.activity.JavaServiceTask - Task [Activity_1dqqoko](가입) finish.(1ms)
10:14:08.323 [Test worker] INFO oasis.model.event.DefaultEndEvent - Task [Event_1fas2fa](Event_1fas2fa) start.
10:14:08.325 [Test worker] INFO oasis.model.event.DefaultEndEvent - Task [Event_1fas2fa](Event_1fas2fa) finish.(1ms)
10:14:08.325 [Test worker] INFO oasis.process.CoreProcessStarter - Process [Process_00plawv](Process_00plawv) finish.(123ms)
10:14:08.326 [Test worker] INFO oasis.service.CoreServiceStarter - Service [member] finish.(256ms)
```

### 위 테스트를 통해 알 수 있는 것

OASIS 서비스는 `ServiceStarter` 인터페이스를 통해서 실행합니다. `ServiceStarter` 는 *service id* 와 *서비스 컨텍스트*를 매개변수로 하는 `start` 메소드가 그 역할을 합니다. 서비스 ID는 곧 파일명입니다. 서비스 실행기는 서비스ID와 같은 파일명을 찾아서 실행할 것입니다. 위 프로젝트에서는 *services* 디렉토리에 저장을 했고 *services* 디렉토리는 서브 디렉토리로 구분해 놓을 수 있습니다. 

서비스 컨텍스트는 사용자 입력을 저장하고 있는 읽기 전용 컨텍스트입니다. 자세한 사항은 [Context](../Context.md) 페이지에서 더 학습할 수 있습니다.

서비스 수행 결과는 `ServiceResult` 객체로 반환되고 결과 코드로 서비스가 정상적으로 수행됐는지 확인 할 수 있습니다. 자세한 사항은 [Service Result](../Service%20Result.md) 페이지에서 더 확인할 수 있습니다.

### 가입오류 테스트

`MemberServiceTest` 클래스에 이미 가입한 멤버를 추가했을 때 에러가 발생하는지 검증하는 테스트 케이스를 추가 작성합니다.

```java
@Test
void whenJoinMemberAlreadyExistsThenThrowException() {
    ServiceStarter serviceStater =
            new NonTransactionalServiceStarterFactory().generateServiceStarter();
    MemoryMemberRepository memberRepository = new MemoryMemberRepository();
    memberRepository.save(new Member("id1", "newMemberName"));

    Map<String, TypedObject> acc = new HashMap<>();
    acc.put("memberRepository", new TypedObject(memberRepository));

    ApplicationContext applicationContext = new DefaultApplicationContext(acc);

    Map<String, TypedObject> scc = new HashMap<>();
    scc.put("id", new TypedObject("id1"));
    scc.put("name", new TypedObject("newMemberName"));

    ServiceContext sc = new DefaultServiceContext(applicationContext, scc);

    ServiceResult start = serviceStater.start("member", sc);
    Assertions.assertThat(start.serviceResultCode())
            .isEqualTo(ServiceResultCode.USER_ERROR);
    Assertions.assertThat(start.serviceResultMessage())
            .isEqualTo("id1는 가입되어 있는 ID입니다.");
}
```

위 테스트에서

```java
memberRepository.save(new Member("id1", "newMemberName"));
```

은 멤버 리포지토리에 id가 *id1*인 멤버를 미리 추가해 놓습니다. 우리가 만들어 놓은 서비스에 의하면 조회 태스크에서 *id1*을 가진 멤버를 조회해보고 그 결과에 따라 분기하게 되어있습니다. 이 경우 *id1* 멤버가 조회될 것이기 때문에 에러 종료 이벤트로 분기할 것입니다.

에러 종료 이벤트로 분기하면 `ServiceResult`에서 에러 코드와 결과 메시지를 받아 볼 수 있습니다. 또한 실행한 로그를 살펴보면 

![Untitled](Branching/Untitled%2017.png)

프로세스가 예외와 함께 종료됐다는 것을 알 수 있습니다.

## 게이트웨이로 태스크 분기

시작 이벤트 다음에 게이트웨이를 넣어서 가입 프로세스인지 조회 프로세스인지 구분하여 분기하는 서비스로 수정을 해보도록 합니다.

![Untitled](Branching/Untitled%2018.png)

### 모델링

1. 게이트웨이 끼워 넣기
    
    ![Untitled](Branching/Untitled%2019.png)
    
    도구 상자에서 게이트웨이를 선택한 뒤 시작 이벤트와 ⭐️  조회 태스크 사이의 흐름을 클릭하면 게이트웨이가 둘 사이에 끼워들어갑니다. 이렇게 하면 편리하게 태스크나 이벤트, 게이트웨이 등 요소를 중간에 넣을 수 있습니다. 게이트웨이를 선택하고 속성 패널에서 프로퍼티를 아래와 같이 입력합니다.
    
    - *Properties* → *Add Property*
        
        *name* : input
        
        *value* : action
        
    
    게이트웨이는 input 프로퍼티에 기입한 값을 컨텍스트에서 가져와 반환하는 역할을 합니다. 따라서 위와 같이 입력하면 *컨텍스트에 action 값을 게이트웨이의 반환값으로 사용하겠다* 라는 의미가 됩니다. 요소의 반환값은 연결된 브랜치에서 직접 참조할 수 있게 되는데 앞선 조회 태스크에서 조회 결과를 확인하는 구문처럼 사용할 수 있습니다.
    
2. ⭐️  조회를 선택해서 Ctrl+C 를 해서 복사합니다. 빈 공간을 클릭하고 Ctrl+V 를 해서 붙여넣기 합니다. ID만 다르고 똑같은 속성을 가진 태스크가 생성됩니다. 새로 만든 태스크(②)를 클릭하고 속성 패널의 Extensions 탭에서 output 속성을 아래와 같이 추가합니다.
    - *Properties* → *Add Property*
        
        *name* : output
        
        *value* : joinedMember
        
    
    태스크의 결과는 output 속성에 지정한 이름으로 프로세스 컨텍스트에 저장됩니다.
    
    프로세스 컨텍스트는 다른 태스크에서 참조할 수 있어 다른 태스크의 input 으로 사용할 수 있습니다. 서비스가 종료되면 프로세스 컨텍스트는 서비스의 결과로 반환됩니다. 
    
3. 종료 이벤트를 연결합니다. 시작 이벤트와 다르게 종료 이벤트는 2개 이상일 수 있습니다.
4. 가입처리 분기 조건을 입력합니다. 게이트웨이의 반환값이 *join*이면 ④ 흐름을 지날 수 있도록 합니다. 흐름을 더블클릭하여 이름을 입력하거나 선택 후 속성 패널의 *name* 에 *join* 이라고 입력합니다.
    - *Name* : join
    
    흐름에 명시적으로 *Expression condition*을 넣지 않고 *name*에 값을 넣으면 *name*에 넣은 값이 condition으로 사용됩니다.
    
    기본적으로 *Expression condition*의 결과값은 `Boolean` 값이어야 합니다. 그러나 반환값이 `String` 타입이면 반환값과 동등성 비교를 해여 참이면 선택합니다.
    
    *name*에 필요한 이름을 넣고 *Expression condition*에 *join* 이라고 입력해도 *name*에 *join*을 입력한 것과 똑같이 동작합니다.
    
5. 조회처리 분기 조건을 입력합니다.
    - *Name* : find

## OASIS Service를 실행하는 테스트 만들기

### 기존 테스트 수정

`MemberServiceTest` 클래스에 추가 했던 runWithOasis와 whenJoinMemberAlreadyExistsThenThrowException 테스트는 더이상 동작하지 않습니다. 게이트웨이에서 사용할 값 *action* 이 존재하지 않기 때문입니다. 실행하면 다음과 같은 로그를 볼 수 있습니다.

```
14:01:51.651 [Test worker] ERROR oasis.service.StopWatchServiceStarter - 분기를 위한 키 [input]의 값을 컨텍스트에서 찾을 수 없습니다. 서비스 컨텍스트에 값이 없거나, 서브 서비스 호출인 경우 서비스 호출 시 프로퍼티 [input]에 키를 전달하지 않았을 수 있습니다.
```

서비스 컨텍스트에 action 값을 추가하면 정상적으로 실행됩니다.

```java
scc.put("action", new TypedObject("join"));
```

![Untitled](Branching/Untitled%2020.png)

새로 추가한 게이트웨이를 통과하여 조회→가입 태스크를 정상적으로 실행한 것을 볼 수 있습니다. 

### 조회 테스트 생성

조회 태스크로 흐름이 정상적으로 흐르고 요청한 멤버를 가져오는지 테스트를 작성합니다.

```java
@Test
void findTest() {
    ServiceStarter serviceStater =
            new NonTransactionalServiceStarterFactory().generateServiceStarter();
    MemoryMemberRepository memberRepository = new MemoryMemberRepository();
    memberRepository.save(new Member("id1", "newMemberName"));

    Map<String, TypedObject> acc = new HashMap<>();
    acc.put("memberRepository", new TypedObject(memberRepository));

    ApplicationContext applicationContext = new DefaultApplicationContext(acc);

    Map<String, TypedObject> scc = new HashMap<>();
    scc.put("id", new TypedObject("id1"));
    scc.put("action", new TypedObject("find"));

    ServiceContext sc = new DefaultServiceContext(applicationContext, scc);

    ServiceResult start = serviceStater.start("member", sc);
    Assertions.assertThat(start.serviceResultCode())
            .isEqualTo(ServiceResultCode.SUCCESS);

    Assertions.assertThat(start.result("joinedMember"))
            .isNotNull();
}
```

# 웹기능 구현

### 컨트롤러 만들기

HTTP 요청을 처리할 컨트롤러를 만들어 봅니다. `controller` 패키지를 만들고 `MemberServiceController` 클래스를 추가합니다.

```java
package oasis.tutorials.branching.controller;

import oasis.TypedObject;
import oasis.context.DefaultServiceContext;
import oasis.context.ServiceContext;
import oasis.context.SpringApplicationContext;
import oasis.service.PlainServiceResult;
import oasis.service.ServiceResult;
import oasis.service.ServiceStarter;
import org.springframework.context.ApplicationContext;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
public class MemberServiceController {
    private final ServiceStarter serviceStarter;
    private final ApplicationContext springApplicationContext;

    public MemberServiceController(ServiceStarter ss, ApplicationContext springApplicationContext) { //변경
        this.serviceStarter = ss;
        this.springApplicationContext = springApplicationContext;
    }

    @RequestMapping("/memberService/{action}")
    public PlainServiceResult memberService(String id, String name, @PathVariable String action) {
        oasis.context.ApplicationContext applicationContext
                = new SpringApplicationContext(springApplicationContext);

        Map<String, TypedObject> scc = new HashMap<>();
        scc.put("id", new TypedObject(id));
        scc.put("name", new TypedObject(name));
        scc.put("action", new TypedObject(action));

        ServiceContext sc = new DefaultServiceContext(applicationContext, scc);

        ServiceResult start = serviceStarter.start("member", sc);

        return new PlainServiceResult(start);
    }
}
```

`memberService` 메소드는 앞선 테스트에서 OASIS 서비스 실행을 위해 작성했던 모습과 유사합니다. 입력값을 만들기 위한 서비스 컨텍스트를 만들고 서비스 ID와 서비스 컨텍스트를 서비스 실행기에 전달해서 OASIS 서비스를 실행합니다. 

요청 패스에 action 값을 서비스 컨텍스트에 전달하여 OASIS 서비스 내 게이트웨이 소스로 바로 사용하도록 하였습니다. 

실행결과는 `PlainServiceResult` 객체로 변환 후 반환합니다. 

<aside>
💡 `@RestController` 로 선언한 스프링 컨트롤러에서 일반 객체를 반환하면 객체를 JSON 문자열로 변환하여 클라이언트로 반환합니다.

</aside>

`MemberServiceController` 는 `ServiceStater` 매개변수를 가진 생성자를 가지고 있습니다. 스프링 컨텍스트는 스프링 컨텍스트 내에 `ServiceStarter` 인스턴스가 있으면 그 인스턴스를 생성자로 전달할 것입니다. `MemberServiceController`가 정상적으로 동작하게 하기 위해서는 스프링 컨텍스트에 `ServiceStarter` 객체를 추가해야합니다.

### 서비스 실행기 스프링 컨텍스트 등록

`OasisConfig` 클래스를 만들어서 `ServiceStater`를 생성하는 Bean 설정을 해보도록 하겠습니다.

```java
package oasis.tutorials.springboot.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import oasis.factories.NonTransactionalServiceStarterFactory;
import oasis.service.ServiceStarter;

@Configuration
public class OasisConfig {
	@Bean
	public ServiceStarter serviceStarter() {
		ServiceStarter generateServiceStarter =
				new NonTransactionalServiceStarterFactory().generateServiceStarter();
		return generateServiceStarter;
	}
}
```

위 코드로 인해 스프링 컨테이너가 생성되면서 `ServiceStater` 빈을 스프링 컨텍스트에 추가할 것입니다.

### 멤버 저장소 스프링 컨텍스트 등록

서비스 내 `MemberService`는 `MemberRepository`가 필요합니다. `MemberRepository`를 스프링 컨텍스트에서 가져올 수 있도록 `OasisConfig`에 빈을 추가합니다.

```java
@Bean
public MemberRepository memberRepositry() {
    return new MemoryMemberRepository();
}
```

### 가입 서비스 요청

TutorialsBranchingApplication*.java* 파일을 열어서 프로젝트를 실행합니다.

이제 웹 브라우저를 켜고 멤버를 추가하는 요청을 보내봅니다.

```
http://localhost:8080/memberService/join?id=id1&name=hihi
```

로그를 확인해 보니 서비스는가 정상적으로 실행된 것을 알 수 있습니다. 서비스결과코드가 *SUCCESS* 이므로 정상적으로 수행됐습니다.

```
{
  "serviceResultCode": "SUCCESS",
  "serviceResultMessage": null,
  "exceptionMessage": null,
  "results": {}
}
```

같은 요청을 다시 한번 보내보시기 바랍니다.

```
{
  "serviceResultCode": "USER_ERROR",
  "serviceResultMessage": "id1는 가입되어 있는 ID입니다.",
  "exceptionMessage": "id1는 가입되어 있는 ID입니다.",
  "results": null
}
```

이미 한번 가입한 멤버이기 때문에 오류가 발생했습니다.

### 조회 서비스 요청

멤버 조회 요청을 아래와 같이 보내봅니다.

```
http://localhost:8080/memberService/find?id=id1&name=hihi
```

요청 결과는 아래와 같이 정상으로 반환되었습니다.

```
{
  "serviceResultCode": "SUCCESS",
  "serviceResultMessage": null,
  "exceptionMessage": null,
  "results": {
    "joinedMember": {
      "object": {
        "id": "id1",
        "name": "hihi"
      },
      "type": "oasis.tutorials.branching.domain.Member"
    }
  }
}
```

# 정리하면

이 튜토리얼에서는 태스크의 결과값을 이용해서 어떻게 분기에 사용하는지, 게이트웨이는 무엇을 반환하고 분기에 사용할 수 있는지에 대하여 알아보았습니다. [Work with SpringBoot](Work%20with%20SpringBoot.md) 튜토리얼에서 `MemberService`는 `MemberService` 내에서 자체적으로 기존 가입 대상이 있는지 확인을 했었지만 이번 튜토리얼에서는 OASIS 서비스에서 확인하도록 변경했습니다. 이렇게 서비스를 설계할 때 어느 깊이로 할지는 상황에 맞춰서 해야 하겠지만 이번 오아시스 서비스는 가입 여부를 파악한다는 사실을 더 직관적으로 개발자에게 알려주는 것은 확실한 듯 합니다. 

**오아시스 서비스를 도메인 객체를 단순히 호출하여 전체적인 흐름만 파악하도록 할 것인지, 상세한 구현 레벨까지 표현할 것인지는 전적으로 설계자와 개발자의 몫입니다. 의도와 목적에 맞게 사용하도록 합니다.**

또한 게이트웨이를 활용하여 웹계층의 컨트롤러를 재사용 가능성을 확인했습니다. 스프링 웹 프로젝트는 요청의 갯수에 따라 무수히 많은 컨트롤러를 생성하게 됩니다. 게이트웨이가 컨트롤러를 대신하게 하여 웹 계층을 단순하게 만들 수 있습니다. 입력값에 대한 편집은 프로세스 어댑터로 구현할 수 있습니다. 자세한 내용은 [Process](../TASK%20%EC%82%AC%EC%9A%A9%EB%B2%95/Process.md) 에서 확인할 수 있습니다.