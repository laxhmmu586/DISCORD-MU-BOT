# MUFC 2.1.6

## 窗口和安装

隐藏 Windows 白色系统标题栏，使用深色拖动区域及 Windows 原生窗口按钮覆盖层，保留拖动、缩放、最大化、最小化、关闭和 F11；Settings 对话框不会挡住原生按钮。窗口主进程变化通过签名 Core 更新，在安全退出后安装。2.1.5 feed 提供到 2.1.6 的 Core；2.1.6 使用独立的兼容 feed。

NSIS 安装步骤内置公钥证书及指纹校验。沿用 per-machine 安装，在 Windows 管理员授权后导入本机 Root / TrustedPublisher，用户无需另跑证书工具。私钥不随包发布，错误指纹中止安装。首次运行安装包时，尚未信任证书的 Windows 提示不能由安装包提前消除。

新版 Core 下载按流写入临时文件，校验大小及 SHA-256 后原子替换，允许十分钟下载大安装包。Windows 签名、证书指纹和安全退出验证保留。

## 本地数据

完整日志和历史文件保留在客户端。后台旧在线 /search 全量 Drive/Gmail 调用移除。GD 校验本地声明与机组；NEXTDAY 使用次日 SY/JCSY；Meal Order 使用明确的本地订单。缺少记录时保持未完成，不继承旧在线完成缓存，也不将本地准备完成当作邮件已发送。

Bag Room 使用 SY/BND 汇总，未提供的明细显示未提供。FSC／订座数旧表回写移除，Record Scan 保存 SQLite，IRR/Record Case 保持退役。Sales Report 保留 Drive，完整清单见 google-drive-dependencies.md。

手工 NEXTDAY 发送保留：仅在明确点击后重读本地次日 SY/JCSY，分页和舱位检查通过才传递聚合数据；服务器验证设备、员工、航班日期和数字范围。自动检查不查邮箱或发送消息。

## 验证和发布

重点测试覆盖签名／回滚、操作延迟刷新、SQLite 清理、窗口 IPC、本地声明／订单的航班日期隔离、旧 Drive 配置移除和 NEXTDAY 聚合数据校验。实际 Electron 启动验证 Firebase、Settings 和窗口脚本；实际打包服务验证 5 个业务页面及 59 个本地依赖。安装包及卸载程序使用固定内部代码签名证书。

机器证书导入仍需要操作员实际运行安装包并允许 Windows 管理员授权；验证不会关闭正在工作的客户端。后端清理改动通过 PR 交付，实际发布状态在 PR 及交付回复注明。

发布验证：83 项重点测试通过；实际打包服务验证本地 SY/BND 查询不会访问云端 /search 或邮件检查；2.1.5 原验证器已从 Oracle 下载并验证 2.1.6 Core，耗时约 11 秒。2.1.5 feed 的签名序号为 2，2.1.6 初始 feed 序号为 1。安装包 Windows 签名为 Valid，SHA-256 为 `5a8cade7a14027b601124067537cac364c81824dfe97e18e74ac458743267b46`。
