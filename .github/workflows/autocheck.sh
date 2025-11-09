#!/bin/bash
git config --local user.email "action@github.com"
git config --local user.name "GitHub Action"

function compare_version() {
    test "$(echo "$@" | tr " " "\n" | sort -V | head -n 1)" != "$1"
}

# 从当前仓库读取版本（不是上游）
RELEASE_TAG=$(cat package.json | jq -r .version)
PUBLISHED_TAG=$(curl -s https://api.github.com/repos/${GITHUB_REPOSITORY}/releases | jq -r '.[] | .tag_name' | head -n 1|sed 's/v//g')

echo "当前版本: ${RELEASE_TAG}"
echo "已发布版本: ${PUBLISHED_TAG}"

# 如果没有已发布的版本，或者当前版本更新，则构建
if [ "${PUBLISHED_TAG}" == "" ] || [ "${PUBLISHED_TAG}" == "null" ] || compare_version ${RELEASE_TAG} ${PUBLISHED_TAG}
then
   echo "需要构建新版本"
   echo "release_tag=${RELEASE_TAG}" >> $GITHUB_OUTPUT
   echo "status=ready" >> $GITHUB_OUTPUT
else
   echo "版本未变化，跳过构建"
   echo "status=skip" >> $GITHUB_OUTPUT
fi
