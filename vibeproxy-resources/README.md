# VibeProxy Resources

This directory contains resources for the integrated VibeProxy functionality in Tataru Assistant.

## Files

- `config.yaml` - CLIProxyAPI configuration
- `cli-proxy-api.exe` - CLIProxyAPI Windows binary (auto-downloaded by GitHub Actions)

## Important

**The `cli-proxy-api.exe` binary is NOT included in the repository.**

It will be automatically downloaded by GitHub Actions during the build process.

For local development on Mac, you don't need this file.

## Download Manually (Optional)

If you want to test locally on Windows:

```bash
curl -L -o vibeproxy-resources/cli-proxy-api.exe \
  https://github.com/router-for-me/CLIProxyAPI/releases/latest/download/cli-proxy-api-windows-amd64.exe
```

## How It Works

When building with electron-builder:
1. GitHub Actions downloads `cli-proxy-api.exe` to this directory
2. electron-builder copies entire `vibeproxy-resources` folder to `resources/vibeproxy/` in the app
3. Tataru Assistant accesses it at runtime via `process.resourcesPath`
