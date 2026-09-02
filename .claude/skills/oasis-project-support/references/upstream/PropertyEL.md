# PropertyEL

프로퍼티가 특정 개체를 가르키는 경우 간단한 표현식으로 개체 내부를 참조하고 참조한 결과의 참조명을 변경하기 위해 사용한다.

![Untitled](PropertyEL/Untitled.png)

위 예제에서 `names[0] -> name` 은 

> *Context*에서 `names` 를 키로 하는 값을 가져온 뒤에 *index* `0` 에 접근하여 `name` 이라는 이름으로 `input` 프로퍼티로 할당하라
> 

라는 의미이다.

이 표현식으로 조회한 결과를 다음 태스크의 입력으로 사용할 때 별도로 데이터 변환을 위한 로직을 작성하지 않고 간단히 할 수 있는 수단을 제공한다.

# 프로퍼티 타입

프로퍼티는 용도와 목적에 따라 *Single/Multiple*, *Value/Reference* 으로 구분할 수 있다. 동일한 이름의 프로퍼티라도 타입과 구체적인 동작은 요소 마다 별도로 정의한다.

## Single/Multiple

### Single

값을 하나만 지정함

### Multiple

값을 복수개로 지정할 수 있음. `,` 구분자로 구분함

예) key1,key2

## Value/Reference

### Value

단순 값만 지정함

### Reference

표현식을 이용해서 참조 개체에 접근한 값을 사용. `->` 키워드로 반환키를 지정할 수 있다.

Key로 값을 가져온 뒤에 컬렉션 접근 표현식으로 요소 값을 가져온다.

# 표현식 표기법

표현식은 `,` 로 구분하여 여러 표현식을 연결할 수 있으며 `키[접근키]->반환키` 가 기본 표현식이다.

```
<Expression>         ::= <Expression><ExpressionSpliter><Expression>
						          | <Value><Accessor><Alias>
						          | <Value><Accessor>
						          | <Value><Alias>
						          | <Accessor><Alias>
						          | <Value>
<Accessor>           ::= <Accessor><Accessor>
									  	| ['<Literal>'] 
					            | ["<Literal>"] 
						          | [<Number>] 
<Alias>              ::= <AliasExpression><Literal>
<Value>              ::= <Literal>
<AliasExpression>    ::= ->
<ExpressionSpliter>  ::= ,
<Literal>            ::= 문자열(숫자포함)
<Number>             ::= 숫자
```

<aside>
💡 [https://www.antlr.org](https://www.antlr.org/)

</aside>

# 표현식 예제

- `aa` 라는 키로 컨텍스트에서 값을 가져와서 `bb` 라는 이름으로 사용함
    
    ```
    aa -> bb
    ```
    

- `aa`라는 키로 컨텍스트에서 값을 가져와서 그 값이 리스트이면 0번째 행을 `bb` 라는 이름으로 사용
    
    ```
    aa[0] -> bb
    ```
    

- `aa`라는 키로 컨텍스트에서 값을 가져와서 그 값이 맵이면 `kk` 라는 키로 값을 가져와 `bb` 라는 이름으로 사용
    
    ```
    aa['kk'] -> bb
    ```
    

- `aa` 라는 키로 컨텍스트에서 값을 가져와서 `bb` 라는 이름으로 사용하고, `yy`라는 키로 컨텍스트에서 값을 가져와서 그 값이 리스트이면 0번째 행을 `kk` 라는 이름으로 사용
    
    ```
    aa -> bb,yy[0] -> kk
    ```