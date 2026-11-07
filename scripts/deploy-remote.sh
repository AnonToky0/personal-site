#!/usr/bin/env bash
set -euo pipefail
site=/var/www/personal-site
releases=/var/www/personal-site-releases
previous=/var/www/personal-site-previous
mode=${1:-check}
for tool in tar flock readlink mv ln; do command -v "$tool" >/dev/null; done
test -d /var/www
test -w /var/www
if [[ -e "$site" && ! -d "$site" ]]; then echo 'Invalid site directory.' >&2; exit 1; fi
if [[ "$mode" == check ]]; then
    printf 'Preflight OK. Site: %s\n' "$(readlink -f "$site")"
    exit 0
fi
exec 9>/var/www/.personal-site-deploy.lock
flock -n 9 || { echo 'Deployment already running.' >&2; exit 1; }
mkdir -p "$releases"
activate() {
    local target=$1 current='' backup=''
    test -s "$target/index.html"
    if [[ -L "$site" ]]; then
        current=$(readlink -f "$site")
        [[ "$current" == "$releases/"* ]] || { echo 'Unexpected current release path.' >&2; return 1; }
    elif [[ -d "$site" ]]; then
        backup="$releases/legacy-$(date +%Y%m%d-%H%M%S)-$$"
        current=$backup
    fi
    local next="${site}.next-$$"
    ln -s "$target" "$next"
    # Preserve rollback metadata before switching the live directory.
    if [[ -n "$current" ]]; then
        ln -s "$current" "${previous}.next-$$"
        mv -Tf "${previous}.next-$$" "$previous"
    fi
    if [[ -n "$backup" ]]; then mv -T "$site" "$backup"; fi
    if ! mv -Tf "$next" "$site"; then
        [[ -z "$backup" ]] || mv -T "$backup" "$site"
        rm -f "$next"
        return 1
    fi
    printf 'Active release: %s\n' "$target"
}
case "$mode" in
deploy)
    release=${2:?Missing release ID}
    [[ "$release" =~ ^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$ ]] || exit 1
    archive="/tmp/personal-site-$release.tar.gz"
    target="$releases/$release"
    test -f "$archive"
    trap 'rm -f "$archive"' EXIT
    mkdir "$target"
    tar --no-same-owner --no-same-permissions -xzf "$archive" -C "$target"
    test -s "$target/index.html"
    test ! -e "$target/fox-preview"
    chmod -R a+rX "$target"
    activate "$target"
    ;;
rollback)
    test -L "$previous" || { echo 'No previous release.' >&2; exit 1; }
    target=$(readlink -f "$previous")
    [[ "$target" == "$releases/"* ]] || exit 1
    activate "$target"
    ;;
*) echo 'Unknown action.' >&2; exit 1 ;;
esac
