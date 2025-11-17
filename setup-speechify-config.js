#!/usr/bin/env node
'use strict';

/**
 * Speechify 快速配置工具
 * 自动将 Bearer Token 写入配置文件
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Bearer Token (from user)
const BEARER_TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjM4MDI5MzRmZTBlZWM0NmE1ZWQwMDA2ZDE0YTFiYWIwMWUzNDUwODMiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiUnVpcnVpIFdhbiIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NJaVJES3BzSkdQd05JakxDTGNnZy13N3hJVExGRVhrZ3Jaak9MTkRRWXplVUwyX1hOMGZRPXMxMjAiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vc3BlZWNoaWZ5bW9iaWxlIiwiYXVkIjoic3BlZWNoaWZ5bW9iaWxlIiwiYXV0aF90aW1lIjoxNzYzMzMyNzA5LCJ1c2VyX2lkIjoiMThuaG03a2duWU5VVUFrZ0hna1hMbnpDWU5NMiIsInN1YiI6IjE4bmhtN2tnbllOVVVBa2dIZ2tYTG56Q1lOTTIiLCJpYXQiOjE3NjMzODU1MjgsImV4cCI6MTc2MzM4OTEyOCwiZW1haWwiOiJydWlydWl3YW44QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7Imdvb2dsZS5jb20iOlsiMTAzNDIyMjI4Njg1MzI0OTAxOTgxIl0sImVtYWlsIjpbInJ1aXJ1aXdhbjhAZ21haWwuY29tIl19LCJzaWduX2luX3Byb3ZpZGVyIjoiY3VzdG9tIn19.oOEbHoj6Y-7Fv7_uwT7-20LxYrG3YoFcmttj2c0xicGkYsL_FLNx_cEB5-v9wJL74poXfqHB0hXvBjKO-0rr0tblnn_iH1wfb6Y5_BpgxytGq5Y6ojRWWskAGmXi8IuvXjks9oXd7a5gjBp735Y1JCtZsNJnzILVBe74EwqfhdhAxGTK8s6GhUJfXOSlzd6E338d0gp7zRkWPOLXCcMv7MzKsx_neywwd4zAFeACz2RUT4vQJRXOzt34tN1D7fcb1q7zzWJLzpNWPlR0KjwRCubFk-LIboUcsOAPwUrzinm1pvW4NK2iEdXL8FusN3L0kMtD7pbDvq4WXG9A9NOLSw';

// Config path
const configDir = path.join(os.homedir(), 'Library', 'Application Support', 'tataru-assistant');
const configPath = path.join(configDir, 'config.json');

console.log('🔧 Speechify 快速配置工具');
console.log('='.repeat(60));
console.log('');

// Create config directory if not exists
if (!fs.existsSync(configDir)) {
  console.log('📁 创建配置目录...');
  fs.mkdirSync(configDir, { recursive: true });
  console.log('   ✅ 目录已创建:', configDir);
  console.log('');
}

// Read or create config
let config = {};

if (fs.existsSync(configPath)) {
  console.log('📖 读取现有配置文件...');
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(content);
    console.log('   ✅ 配置文件已加载');
  } catch (error) {
    console.log('   ⚠️  配置文件格式错误，将创建新配置');
    config = {};
  }
} else {
  console.log('📄 配置文件不存在，将创建新文件');
}

console.log('');

// Ensure api.speechify structure exists
if (!config.api) {
  config.api = {};
}
if (!config.api.speechify) {
  config.api.speechify = {};
}

// Set Speechify configuration
console.log('⚙️  配置 Speechify TTS...');
config.api.speechify.bearerToken = BEARER_TOKEN;
config.api.speechify.voiceId = 'gwyneth';
config.api.speechify.audioFormat = 'mp3';

console.log('   ✅ Bearer Token: ********' + BEARER_TOKEN.slice(-20));
console.log('   ✅ Voice ID: gwyneth');
console.log('   ✅ Audio Format: mp3');
console.log('');

// Set TTS engine to Speechify (optional)
if (!config.indexWindow) {
  config.indexWindow = {};
}
config.indexWindow.ttsEngine = 'speechify';
console.log('   ✅ 默认 TTS 引擎: speechify');
console.log('');

// Save config
console.log('💾 保存配置文件...');
try {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log('   ✅ 配置已保存:', configPath);
} catch (error) {
  console.error('   ❌ 保存失败:', error.message);
  process.exit(1);
}

console.log('');
console.log('='.repeat(60));
console.log('🎉 Speechify 配置完成！');
console.log('');
console.log('📋 下一步：');
console.log('   1. 启动 Tataru Assistant: npm start');
console.log('   2. 打开编辑窗口查看历史对话');
console.log('   3. 选择 "Speechify" TTS 引擎');
console.log('   4. 点击 "🔊 播放语音" 测试');
console.log('');
console.log('⚠️  注意：Bearer Token 有效期 1-4 小时，过期后需重新获取');
console.log('');
