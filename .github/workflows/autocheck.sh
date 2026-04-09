#!/bin/bash
set -euo pipefail

git config --local user.email "action@github.com"
git config --local user.name "GitHub Action"

compare_version() {
    test "$(printf '%s\n' "$@" | sort -V | head -n 1)" != "$1"
}

required_files=(
    "package.json"
    "src/module/system/config-module.js"
    "src/module/system/elevenlabs-browser-assist.js"
    "src/html/config.html"
    "src/html/config.js"
    "extension/elevenreader-bearer/manifest.json"
    "extension/elevenreader-bearer/background.js"
    "extension/elevenreader-bearer/README.md"
    "src/data/text/readme/index.html"
    "src/data/text/readme/elevenlabs-token-helper.html"
)

for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        echo "Missing required release file: $file"
        exit 1
    fi
done

RELEASE_TAG=$(jq -r .version package.json)
if [ -z "${RELEASE_TAG}" ] || [ "${RELEASE_TAG}" = "null" ]; then
    echo "Unable to resolve package.json version"
    exit 1
fi

CURL_HEADERS=(-H "Accept: application/vnd.github+json")
if [ -n "${GITHUB_TOKEN:-}" ]; then
    CURL_HEADERS+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
elif [ -n "${GH_TOKEN:-}" ]; then
    CURL_HEADERS+=(-H "Authorization: Bearer ${GH_TOKEN}")
fi

PUBLISHED_TAG=$(curl -fsSL "${CURL_HEADERS[@]}" "https://api.github.com/repos/${GITHUB_REPOSITORY}/releases?per_page=1" | jq -r '.[0].tag_name // empty' | sed 's/^v//')

echo "当前版本: ${RELEASE_TAG}"
echo "已发布版本: ${PUBLISHED_TAG}"

if [ -z "${PUBLISHED_TAG}" ] || compare_version "${RELEASE_TAG}" "${PUBLISHED_TAG}"
then
   echo "需要构建新版本"
   echo "release_tag=${RELEASE_TAG}" >> "$GITHUB_OUTPUT"
   echo "status=ready" >> "$GITHUB_OUTPUT"
else
   echo "版本未变化，跳过构建"
   echo "status=skip" >> "$GITHUB_OUTPUT"
fi
