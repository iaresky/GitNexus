<%@ page language="java" import="java.util.*" %>

<%
    String message = "Hello World";
    int count = 42;
    
    List<String> list = new ArrayList<>();
    list.add("one");
    list.add("two");
%>

<html>
<body>
    <h1><%= message %></h1>
    <p>Count: <%= count %></p>
    
    <form action="submit.jsp" method="post">
        <input type="text" name="data"/>
        <input type="submit"/>
    </form>
</body>
</html>
