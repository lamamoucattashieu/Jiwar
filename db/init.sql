-- Local only: creates one database and one login per service.
-- Idempotent: safe to run on every `docker compose up`.
-- Passwords come from sqlcmd variables set in .env, never from this file.
-- On Azure the databases and logins are created once during the initial setup.

IF DB_ID('learning') IS NULL CREATE DATABASE learning;
GO
IF DB_ID('projects') IS NULL CREATE DATABASE projects;
GO

IF SUSER_ID('learning_user') IS NULL
    CREATE LOGIN learning_user WITH PASSWORD = '$(LEARNING_DB_PASSWORD)';
GO
IF SUSER_ID('projects_user') IS NULL
    CREATE LOGIN projects_user WITH PASSWORD = '$(PROJECTS_DB_PASSWORD)';
GO

-- Each login is owner of its own database only (it runs that service's migrations)
-- and has no user in the other database.
USE learning;
IF USER_ID('learning_user') IS NULL CREATE USER learning_user FOR LOGIN learning_user;
ALTER ROLE db_owner ADD MEMBER learning_user;
GO

USE projects;
IF USER_ID('projects_user') IS NULL CREATE USER projects_user FOR LOGIN projects_user;
ALTER ROLE db_owner ADD MEMBER projects_user;
GO
