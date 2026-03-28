<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" import="java.util.List,java.util.ArrayList" %>
<%@ include file="/WEB-INF/common/header.jsp" %>
<%@ taglib uri="http://java.sun.com/jsp/jstl/core" prefix="c" %>

<!DOCTYPE html>
<html>
<head>
    <title>Test JSP</title>
    <script src="/js/jquery.min.js"></script>
    <link href="/css/style.css" rel="stylesheet"/>
</head>
<body>
    <%!
        private String appName = "TestApp";
        private int version = 1;
        
        public String getAppName() {
            return appName;
        }
    %>
    
    <%
        List<String> items = new ArrayList<>();
        items.add("Item 1");
        items.add("Item 2");
        items.add("Item 3");
        
        String userName = request.getParameter("user");
        if (userName == null) {
            userName = "Guest";
        }
        
        session.setAttribute("currentUser", userName);
    %>
    
    <h1>Welcome, <%= userName %>!</h1>
    <p>Application: <%= getAppName() %></p>
    
    <form action="/submit" method="post">
        <input type="text" name="username" value="<%= userName %>"/>
        <input type="submit" value="Submit"/>
    </form>
    
    <a href="/home">Go Home</a>
    <a href="/profile?id=123">View Profile</a>
    
    <%
        for (String item : items) {
            out.println("<p>" + item + "</p>");
        }
    %>
    
    <p>User: ${sessionScope.currentUser}</p>
    <p>Status: ${requestScope.status}</p>
</body>
</html>
