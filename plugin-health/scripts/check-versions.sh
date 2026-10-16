#!/usr/bin/env bash
# All five Plugin Health languages carry one version: the version files, the version constants
# and (once released) the newest "## X.Y.Z" section of CHANGELOG.md must agree.
# Prints the version; exits 1 on a mismatch. Used by CI and the release workflow.
set -euo pipefail
cd "$(dirname "$0")/.."

declare -A found=(
  [typescript/package.json]="$(sed -n 's/^  "version": "\([^"]*\)".*/\1/p' typescript/package.json)"
  [typescript/src/index.ts]="$(sed -n "s/^export const PLUGIN_HEALTH_VERSION = '\([^']*\)'.*/\1/p" typescript/src/index.ts)"
  [php/src/PluginHealth.php]="$(sed -n "s/.*PLUGIN_HEALTH_VERSION = '\([^']*\)'.*/\1/p" php/src/PluginHealth.php)"
  [python/pyproject.toml]="$(sed -n 's/^version = "\([^"]*\)".*/\1/p' python/pyproject.toml)"
  [python/src/supertext_plugin_health/version.py]="$(sed -n 's/^PLUGIN_HEALTH_VERSION: Final = "\([^"]*\)".*/\1/p' python/src/supertext_plugin_health/version.py)"
  [dotnet/src/Supertext.PluginHealth/Supertext.PluginHealth.csproj]="$(sed -n 's/.*<Version>\([^<]*\)<\/Version>.*/\1/p' dotnet/src/Supertext.PluginHealth/Supertext.PluginHealth.csproj)"
  [dotnet/src/Supertext.PluginHealth/PluginHealthInfo.cs]="$(sed -n 's/.*const string Version = "\([^"]*\)".*/\1/p' dotnet/src/Supertext.PluginHealth/PluginHealthInfo.cs)"
  [java/pom.xml]="$(sed -n '0,/<version>/s/^  <version>\([^<]*\)<\/version>.*/\1/p' java/pom.xml)"
  [java/src/main/java/com/supertext/pluginhealth/PluginHealthInfo.java]="$(sed -n 's/.*String VERSION = "\([^"]*\)".*/\1/p' java/src/main/java/com/supertext/pluginhealth/PluginHealthInfo.java)"
)
version="${found[typescript/package.json]}"
status=0
for file in "${!found[@]}"; do
  if [ "${found[$file]}" != "$version" ]; then
    echo "::error file=plugin-health/$file::version '${found[$file]}' differs from typescript/package.json '$version'"
    status=1
  fi
done
released="$(grep -m1 -oE '^## [0-9]+\.[0-9]+\.[0-9]+' CHANGELOG.md | cut -c4- || true)"
if [ -n "$released" ] && [ "$released" != "$version" ]; then
  echo "::error file=plugin-health/CHANGELOG.md::newest release $released, but the version files say $version"
  status=1
fi
[ "$status" = 0 ] && echo "$version"
exit "$status"
