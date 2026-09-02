# Gateway

프로세스의 흐름을 분기하거나, 병렬 수행 또는 수렴시키기 위한 모델이다.

# Exclusive Gateway

조건이 맞는 브랜치 한 곳으로 분기하는 역할을 합니다. 하지만 Exclusive Gateway 자체가 분기를 한다는 의미는 아닙니다. Exclusive Gateway는 입력값을 그대로 반환하여 브랜치가 반환 값을 평가 후 흐름을 결정합니다.

## 입력값 설정

- *Properties* → *Add Property*
    
    *name* : input
    
    *value* : action
    

게이트웨이는 input 프로퍼티에 기입한 값을 컨텍스트에서 가져와 반환하는 역할을 합니다. 따라서 위와 같이 입력하면 *컨텍스트에 action 값을 게이트웨이의 반환값으로 사용하겠다* 라는 의미가 됩니다. 요소의 반환값은 연결된 브랜치에서 직접 참조할 수 있습니다.