# Project & Workspace Rules

## Browser Automation & Chromium Binary Path
- **Global Chromium Executable**: `C:\Users\acer nitro\.gemini\tools\chromium\chrome.exe`
- **Environment Variables**: `PUPPETEER_EXECUTABLE_PATH` and `CHROME_PATH` are configured globally to point to `C:\Users\acer nitro\.gemini\tools\chromium\chrome.exe`.
- **Mandatory Rule**: For all web automation, Puppeteer, Playwright, or browser testing tasks, ALWAYS use the standalone Chromium binary located at `C:\Users\acer nitro\.gemini\tools\chromium\chrome.exe`.
- **Constraint**: DO NOT use Google Chrome or ask/prompt the user to install any external browser. Always rely on this standalone global Chromium installation.

## Verification Rule
- **Mandatory Verification**: NEVER claim a UI task or bug fix is completed without taking a fresh screenshot or visually inspecting the result in the browser first. Carefully inspect the visual output of the browser screenshot to verify that the fix actually worked before reporting back to the user.
