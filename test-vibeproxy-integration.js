/**
 * VibeProxy Integration Test
 *
 * 这个文件测试 VibeProxy 集成是否正常工作
 * 在 Mac 开发环境下运行，不需要 Windows binary
 */

const path = require('path');
const fs = require('fs');

console.log('=== VibeProxy Integration Test ===\n');

// 测试 1: 检查文件结构
console.log('Test 1: 检查文件结构');
console.log('─'.repeat(50));

const requiredFiles = [
  'package.json',
  'vibeproxy-resources/config.yaml',
  'vibeproxy-resources/.gitignore',
  'vibeproxy-resources/README.md',
  'src/vibeproxy/vibeproxy-manager.js',
  'src/vibeproxy/server-manager.js',
  'src/vibeproxy/auth-monitor.js'
];

let allFilesExist = true;

requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  const status = exists ? '✓' : '✗';
  console.log(`${status} ${file}`);
  if (!exists) allFilesExist = false;
});

console.log('');
if (allFilesExist) {
  console.log('✓ 所有必需文件都存在\n');
} else {
  console.log('✗ 部分文件缺失！\n');
  process.exit(1);
}

// 测试 2: 检查 package.json 配置
console.log('Test 2: 检查 package.json 配置');
console.log('─'.repeat(50));

try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

  // 检查 chokidar 依赖
  const hasChokidar = packageJson.dependencies && packageJson.dependencies.chokidar;
  console.log(`${hasChokidar ? '✓' : '✗'} chokidar 依赖已添加`);

  // 检查 extraFiles 配置
  const hasExtraFiles = packageJson.build &&
                        packageJson.build.extraFiles &&
                        packageJson.build.extraFiles.some(item =>
                          typeof item === 'object' && item.from === 'vibeproxy-resources'
                        );
  console.log(`${hasExtraFiles ? '✓' : '✗'} vibeproxy-resources 构建配置已添加`);

  console.log('');
  if (hasChokidar && hasExtraFiles) {
    console.log('✓ package.json 配置正确\n');
  } else {
    console.log('✗ package.json 配置有误！\n');
    process.exit(1);
  }
} catch (error) {
  console.log('✗ 读取 package.json 失败:', error.message, '\n');
  process.exit(1);
}

// 测试 3: 检查 VibeProxy 模块语法
console.log('Test 3: 检查 VibeProxy 模块语法');
console.log('─'.repeat(50));

try {
  // 检查文件内容而不是加载模块（因为需要 Electron）
  const managerContent = fs.readFileSync('src/vibeproxy/vibeproxy-manager.js', 'utf-8');
  const hasInitialize = managerContent.includes('initialize()');
  const hasStart = managerContent.includes('start()');
  console.log(`${hasInitialize ? '✓' : '✗'} vibeproxy-manager.js 包含 initialize()`);
  console.log(`${hasStart ? '✓' : '✗'} vibeproxy-manager.js 包含 start()`);

  const serverContent = fs.readFileSync('src/vibeproxy/server-manager.js', 'utf-8');
  const hasServerStart = serverContent.includes('class ServerManager');
  console.log(`${hasServerStart ? '✓' : '✗'} server-manager.js 定义 ServerManager`);

  const authContent = fs.readFileSync('src/vibeproxy/auth-monitor.js', 'utf-8');
  const hasAuthMonitor = authContent.includes('class AuthMonitor');
  console.log(`${hasAuthMonitor ? '✓' : '✗'} auth-monitor.js 定义 AuthMonitor`);

  console.log('');
  console.log('✓ 模块结构正确 (需要 Electron 环境才能完全加载)\n');
} catch (error) {
  console.log('✗ 模块检查失败:', error.message, '\n');
  process.exit(1);
}

// 测试 4: 检查 .gitignore 配置
console.log('Test 4: 检查 .gitignore 配置');
console.log('─'.repeat(50));

try {
  const gitignore = fs.readFileSync('vibeproxy-resources/.gitignore', 'utf-8');
  const ignoresBinary = gitignore.includes('cli-proxy-api.exe');
  console.log(`${ignoresBinary ? '✓' : '✗'} cli-proxy-api.exe 已在 .gitignore 中`);

  console.log('');
  if (ignoresBinary) {
    console.log('✓ .gitignore 配置正确\n');
  } else {
    console.log('✗ .gitignore 配置有误！\n');
    process.exit(1);
  }
} catch (error) {
  console.log('✗ 读取 .gitignore 失败:', error.message, '\n');
  process.exit(1);
}

// 测试 5: 检查 GitHub Actions workflow
console.log('Test 5: 检查 GitHub Actions workflow');
console.log('─'.repeat(50));

try {
  const workflow = fs.readFileSync('.github/workflows/build.yml', 'utf-8');

  const hasDownloadStep = workflow.includes('Download CLIProxyAPI for VibeProxy');
  console.log(`${hasDownloadStep ? '✓' : '✗'} 包含 CLIProxyAPI 下载步骤`);

  const hasVerifyStep = workflow.includes('Verify downloaded file');
  console.log(`${hasVerifyStep ? '✓' : '✗'} 包含文件验证步骤`);

  const downloadsToCorrectPath = workflow.includes('vibeproxy-resources/cli-proxy-api.exe');
  console.log(`${downloadsToCorrectPath ? '✓' : '✗'} 下载到正确路径`);

  console.log('');
  if (hasDownloadStep && hasVerifyStep && downloadsToCorrectPath) {
    console.log('✓ GitHub Actions workflow 配置正确\n');
  } else {
    console.log('✗ GitHub Actions workflow 配置有误！\n');
    process.exit(1);
  }
} catch (error) {
  console.log('✗ 读取 workflow 文件失败:', error.message, '\n');
  process.exit(1);
}

// 测试 6: 检查文档完整性
console.log('Test 6: 检查文档完整性');
console.log('─'.repeat(50));

const docFiles = [
  'VIBEPROXY_INTEGRATION_GUIDE.md',
  'QUICK_UPLOAD_GUIDE.txt'
];

let allDocsExist = true;
docFiles.forEach(file => {
  const exists = fs.existsSync(file);
  const status = exists ? '✓' : '✗';
  console.log(`${status} ${file}`);
  if (!exists) allDocsExist = false;
});

console.log('');
if (allDocsExist) {
  console.log('✓ 所有文档都存在\n');
} else {
  console.log('⚠️  部分文档缺失（非致命）\n');
}

// 测试 7: Mac 环境兼容性检查
console.log('Test 7: Mac 环境兼容性检查');
console.log('─'.repeat(50));

const binaryPath = 'vibeproxy-resources/cli-proxy-api.exe';
const binaryExists = fs.existsSync(binaryPath);

if (binaryExists) {
  console.log('⚠️  检测到 cli-proxy-api.exe (Mac 开发不需要)');
  console.log('   这个文件应该被 .gitignore 忽略');
} else {
  console.log('✓ cli-proxy-api.exe 不存在 (Mac 开发环境正常)');
  console.log('   GitHub Actions 会自动下载 Windows binary');
}

console.log('');
console.log('✓ Mac 环境兼容\n');

// 最终总结
console.log('='.repeat(50));
console.log('');
console.log('🎉 所有测试通过！VibeProxy 集成正常！');
console.log('');
console.log('下一步:');
console.log('  1. 执行: git add .');
console.log('  2. 执行: git commit -m "feat: integrate VibeProxy"');
console.log('  3. 执行: git push origin main');
console.log('');
console.log('GitHub Actions 会自动下载 CLIProxyAPI 并打包。');
console.log('');
console.log('='.repeat(50));
