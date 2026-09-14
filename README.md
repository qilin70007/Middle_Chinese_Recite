# 文绮语文背诵（Middle Chinese Recite）

面向上海六年级学生的安卓语文背诵辅助软件。所有学习数据保存在手机本地，无需注册，离线也能使用。

## 首版功能

- 建立背诵篇目：古诗、文言文、现代文，可录入作者、正文、译文/提示
- 自动按标点和换行分句，也可逐句练习
- 四种练习：朗读、逐句、挖空、默背
- 逐句标记“已掌握 / 模糊 / 不熟”，首次标记模糊或不熟后自动加入重难点
- 按 1、2、4、7、15、30 天节奏安排到期复习
- 中文 TTS 朗读，可调语速、句间停顿和循环次数
- “播放整篇”使用安卓前台播放服务，切换应用或息屏后仍可继续
- 本地备份与恢复（JSON）
- 内置《七步诗》《孟母断织》示例；不内置现代教材全文

## 安装 APK

[直接下载最新安卓 APK](https://github.com/qilin70007/Middle_Chinese_Recite/releases/download/latest/Middle_Chinese_Recite-latest.apk)

首次安装时，安卓可能提示“未知来源应用”；确认文件来自本仓库后允许本次安装即可。也可进入 **Actions → Build Android APK** 下载构建产物。

## 本地构建

需要 JDK 17、Android SDK 36 和 Gradle 8.13：

```bash
gradle :app:assembleDebug
```

APK 输出：`app/build/outputs/apk/debug/app-debug.apk`

## 数据与隐私

篇目、熟练度和复习记录仅存储在本机 WebView 的本地数据库中。卸载前请先在“设置”页导出备份。
