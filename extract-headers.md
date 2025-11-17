# 如何提取完整的请求信息

## 方法 1: 使用 Copy as cURL

这是最简单的方法！

1. 在 Chrome DevTools Network 标签中
2. 找到 `synthesis/get` 请求（POST 方法）
3. **右键点击** 该请求
4. 选择 **Copy > Copy as cURL (bash)**
5. 粘贴到文本编辑器

你会看到类似这样的内容：

```bash
curl 'https://audio.api.speechify.com/v3/synthesis/get' \
  -H 'authority: audio.api.speechify.com' \
  -H 'accept: */*' \
  -H 'authorization: Bearer eyJh...' \
  -H 'content-type: application/json' \
  -H 'x-speechify-client: SOME_VALUE_HERE' \  ← 找到这个！
  --data-raw '{"ssml":"...","voice":"gwyneth","forcedAudioFormat":"ogg"}'
```

查找 `-H 'x-speechify-client: ...'` 这一行！

## 方法 2: 手动查看所有 Headers

1. 点击 `synthesis/get` 请求
2. Headers 标签
3. 向下滚动 Request Headers 列表
4. 查找所有以 `X-` 开头的 headers
5. 特别注意 `X-Speechify-Client`

## 需要找到的 Headers

请提供以下所有 headers 的值：

- ✅ `Authorization` (已有)
- ❓ `X-Speechify-Client` (需要)
- ❓ 其他 `X-Speechify-*` headers（如果有）

把这些信息发给我，我会立即更新代码！
