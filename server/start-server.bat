@echo off
cd /d %~dp0
set JAVA=java
if defined GROKBOT_JAVA set JAVA=%GROKBOT_JAVA%
if not defined GROKBOT_JAVA if defined JAVA_HOME set JAVA=%JAVA_HOME%\bin\java
"%JAVA%" -Xmx2G -jar server.jar nogui
pause
