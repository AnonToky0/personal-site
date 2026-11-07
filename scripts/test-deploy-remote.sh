#!/usr/bin/env bash
# Run on Linux: bash test-deploy-remote.sh /path/to/deploy-remote.sh
set -euo pipefail
sandbox=$(mktemp -d /tmp/deploy-qa.XXXXXXXX)
trap 'rm -rf -- "$sandbox"' EXIT
mkdir -p "$sandbox/www/personal-site" "$sandbox/package"
sed -e "s|/var/www|$sandbox/www|g" -e "s|/tmp/personal-site-|$sandbox/personal-site-|g" "$1" > "$sandbox/deploy.sh"
run() { bash "$sandbox/deploy.sh" "$@"; }
site="$sandbox/www/personal-site"
printf old > "$site/index.html"
run check
printf new > "$sandbox/package/index.html"
release=20261107-000001-abcdef01
tar -czf "$sandbox/personal-site-$release.tar.gz" -C "$sandbox/package" .
run deploy "$release"
test -L "$site"
test "$(cat "$site/index.html")" = new
run rollback
test "$(cat "$site/index.html")" = old
run rollback
test "$(cat "$site/index.html")" = new
printf broken > "$sandbox/personal-site-20261107-000002-abcdef02.tar.gz"
if run deploy 20261107-000002-abcdef02; then exit 1; fi
test "$(cat "$site/index.html")" = new
mkdir "$sandbox/package/fox-preview"
tar -czf "$sandbox/personal-site-20261107-000003-abcdef03.tar.gz" -C "$sandbox/package" .
if run deploy 20261107-000003-abcdef03; then exit 1; fi
test "$(cat "$site/index.html")" = new
if flock "$sandbox/www/.personal-site-deploy.lock" bash "$sandbox/deploy.sh" rollback; then exit 1; fi
test "$(cat "$site/index.html")" = new
echo 'PASS: preflight, legacy migration, publication, rollback toggling, corrupt archive, development-page rejection, and deployment lock.'
