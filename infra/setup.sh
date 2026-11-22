#!/usr/bin/env bash
# One-time Azure setup for the group, run by one member (A2 guide, group section).
# Safe to run again: Bicep only changes what differs, users are created or
# updated, and the running images are kept.
#
# Needs: bash, az (signed in to the IE tenant), gh (signed in), sqlcmd, curl.
# Azure Cloud Shell has az and sqlcmd; run `gh auth login` there first.
#
#   az login --tenant 5ca2bc70-353c-4d1f-b7d7-7f2b2259df68   # add --use-device-code if needed
#   export PREFIX=sdd-3a-g3                 # your group prefix
#   export GITHUB_REPO=owner/Jiwar          # the team repository
#   export SQL_ADMIN_PASSWORD=...           # choose strong passwords; never commit them
#   export LEARNING_DB_PASSWORD=...
#   export PROJECTS_DB_PASSWORD=...
#   bash infra/setup.sh
set -euo pipefail

: "${PREFIX:?set PREFIX, e.g. sdd-3a-g3}"
: "${GITHUB_REPO:?set GITHUB_REPO, e.g. owner/Jiwar}"
: "${SQL_ADMIN_PASSWORD:?set SQL_ADMIN_PASSWORD}"
: "${LEARNING_DB_PASSWORD:?set LEARNING_DB_PASSWORD}"
: "${PROJECTS_DB_PASSWORD:?set PROJECTS_DB_PASSWORD}"
RESOURCE_GROUP="${RESOURCE_GROUP:-rg-$PREFIX}"
SQL_ADMIN_LOGIN="${SQL_ADMIN_LOGIN:-jiwaradmin}"
here="$(cd "$(dirname "$0")" && pwd)"

echo "== 1. Resources (Bicep) in $RESOURCE_GROUP"
# Keep the images CD deployed, so re-running setup does not roll the apps back.
current_image() {
  az containerapp show -n "$PREFIX-$1" -g "$RESOURCE_GROUP" \
    --query 'properties.template.containers[0].image' -o tsv 2>/dev/null ||
    echo 'mcr.microsoft.com/k8se/quickstart:latest'
}
az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --name jiwar \
  --template-file "$here/main.bicep" \
  --parameters prefix="$PREFIX" \
  sqlAdminLogin="$SQL_ADMIN_LOGIN" \
  sqlAdminPassword="$SQL_ADMIN_PASSWORD" \
  learningDbPassword="$LEARNING_DB_PASSWORD" \
  projectsDbPassword="$PROJECTS_DB_PASSWORD" \
  learningImage="$(current_image learning)" \
  projectsImage="$(current_image projects)" \
  --output none

echo "== 2. One contained user per database (db_ddladmin, db_datareader, db_datawriter)"
sql_host="$PREFIX-sql.database.windows.net"
my_ip="$(curl --silent --fail https://api.ipify.org)"
az sql server firewall-rule create -g "$RESOURCE_GROUP" -s "$PREFIX-sql" \
  -n setup-temporary --start-ip-address "$my_ip" --end-ip-address "$my_ip" --output none
# Close the firewall again however the script ends.
trap 'az sql server firewall-rule delete -g "$RESOURCE_GROUP" -s "$PREFIX-sql" -n setup-temporary --output none || true' EXIT

create_user() {
  local service="$1" password="$2"
  # The password reaches sqlcmd as a variable, so it never appears in a file.
  SQLCMDPASSWORD="$SQL_ADMIN_PASSWORD" sqlcmd -S "$sql_host" -d "$PREFIX-$service-db" \
    -U "$SQL_ADMIN_LOGIN" -b -l 120 -v USER_NAME="${service}_user" USER_PASSWORD="$password" -Q "
      IF USER_ID('\$(USER_NAME)') IS NULL
        CREATE USER [\$(USER_NAME)] WITH PASSWORD = '\$(USER_PASSWORD)';
      ELSE
        ALTER USER [\$(USER_NAME)] WITH PASSWORD = '\$(USER_PASSWORD)';
      ALTER ROLE db_ddladmin ADD MEMBER [\$(USER_NAME)];
      ALTER ROLE db_datareader ADD MEMBER [\$(USER_NAME)];
      ALTER ROLE db_datawriter ADD MEMBER [\$(USER_NAME)];"
  echo "   ${service}_user ready in $PREFIX-$service-db"
}
create_user learning "$LEARNING_DB_PASSWORD"
create_user projects "$PROJECTS_DB_PASSWORD"

echo "== 3. Let GitHub Actions on main sign in as $PREFIX-github (OIDC)"
identity="$PREFIX-github"
owner="${GITHUB_REPO%%/*}"
repo="${GITHUB_REPO#*/}"
owner_id="$(gh api "users/$owner" --jq .id)"
repo_id="$(gh api "repos/$GITHUB_REPO" --jq .id)"
# GitHub sends the subject with names or with numeric ids; register both.
add_subject() {
  local name="$1" subject="$2"
  if az identity federated-credential show -g "$RESOURCE_GROUP" --identity-name "$identity" -n "$name" >/dev/null 2>&1; then
    echo "   $name already registered"
    return
  fi
  az identity federated-credential create -g "$RESOURCE_GROUP" --identity-name "$identity" -n "$name" \
    --issuer https://token.actions.githubusercontent.com \
    --audiences api://AzureADTokenExchange \
    --subject "$subject" --output none
  echo "   registered $subject"
}
add_subject github-main "repo:${owner}/${repo}:ref:refs/heads/main"
add_subject github-main-ids "repo:${owner}@${owner_id}/${repo}@${repo_id}:ref:refs/heads/main"

echo "== 4. GitHub secrets and variables for cd.yml"
gh secret set AZURE_CLIENT_ID -R "$GITHUB_REPO" \
  --body "$(az identity show -g "$RESOURCE_GROUP" -n "$identity" --query clientId -o tsv)"
gh secret set AZURE_TENANT_ID -R "$GITHUB_REPO" --body "$(az account show --query tenantId -o tsv)"
gh secret set AZURE_SUBSCRIPTION_ID -R "$GITHUB_REPO" --body "$(az account show --query id -o tsv)"
gh variable set PREFIX -R "$GITHUB_REPO" --body "$PREFIX"
gh variable set RESOURCE_GROUP -R "$GITHUB_REPO" --body "$RESOURCE_GROUP"

echo
echo "Done. Addresses:"
az deployment group show -g "$RESOURCE_GROUP" -n jiwar --query properties.outputs -o jsonc
echo
echo "Next: merge to main. The first CD run fails to pull the new GHCR images because"
echo "they are private: make jiwar-learning and jiwar-projects public under the owner's"
echo "GitHub Packages settings, then re-run the failed job (A2 guide, step 8)."
